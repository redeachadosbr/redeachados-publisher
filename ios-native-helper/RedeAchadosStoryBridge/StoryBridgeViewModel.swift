import Foundation
import SwiftUI
import UIKit

struct StoryShareInfo: Decodable {
    let ok: Bool?
    let title: String
    let productUrl: String
    let expiresAt: String?
    let videoUrl: String
    let downloadUrl: String?
    let metaAppId: String?
}

@MainActor
final class StoryBridgeViewModel: ObservableObject {
    @Published var status = "Abra um QR Code de Story no Publisher para começar."
    @Published var isWorking = false
    @Published var canRetry = false

    private var lastVideoData: Data?
    private var lastProductURL: String?
    private var lastMetaAppId: String?
    private var lastTitle: String?

    private let fallbackMetaAppId = "1113447937922102"

    func handle(url: URL) async {
        guard url.scheme?.lowercased() == "redeachados",
              url.host?.lowercased() == "story" else {
            status = "Link inválido. Gere um novo QR Code no Publisher."
            return
        }

        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let hostString = components.queryItems?.first(where: { $0.name == "host" })?.value,
              let token = components.queryItems?.first(where: { $0.name == "token" })?.value,
              let baseURL = URL(string: hostString),
              baseURL.scheme?.lowercased() == "https" else {
            status = "O link do Publisher está incompleto ou não é seguro."
            return
        }

        await loadAndOpen(baseURL: baseURL, token: token)
    }

    func retry() async {
        guard let data = lastVideoData,
              let productURL = lastProductURL else {
            status = "Gere um novo QR Code no Publisher."
            canRetry = false
            return
        }
        await openInstagramStory(videoData: data,
                                 productURL: productURL,
                                 appId: lastMetaAppId ?? fallbackMetaAppId,
                                 title: lastTitle ?? "REDE ACHADOS BR")
    }

    private func loadAndOpen(baseURL: URL, token: String) async {
        isWorking = true
        canRetry = false
        lastVideoData = nil
        status = "Lendo os dados do Story…"

        do {
            guard var infoComponents = URLComponents(url: baseURL.appendingPathComponent("api/story-share/info"), resolvingAgainstBaseURL: false) else {
                throw BridgeError.invalidURL
            }
            infoComponents.queryItems = [URLQueryItem(name: "t", value: token)]
            guard let infoURL = infoComponents.url else { throw BridgeError.invalidURL }

            var request = URLRequest(url: infoURL)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 30
            let (infoData, infoResponse) = try await URLSession.shared.data(for: request)
            guard let http = infoResponse as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                let serverMessage = try? JSONSerialization.jsonObject(with: infoData) as? [String: Any]
                throw BridgeError.server(serverMessage?["error"] as? String ?? "Não foi possível ler o Story.")
            }

            let info = try JSONDecoder().decode(StoryShareInfo.self, from: infoData)
            guard let relativeVideoURL = URL(string: info.videoUrl, relativeTo: baseURL)?.absoluteURL else {
                throw BridgeError.invalidURL
            }

            status = "Baixando o vídeo para abrir no Instagram…"
            var videoRequest = URLRequest(url: relativeVideoURL)
            videoRequest.cachePolicy = .reloadIgnoringLocalCacheData
            videoRequest.timeoutInterval = 180
            let (videoData, videoResponse) = try await URLSession.shared.data(for: videoRequest)
            guard let videoHTTP = videoResponse as? HTTPURLResponse, (200..<300).contains(videoHTTP.statusCode) else {
                throw BridgeError.server("O vídeo temporário não pôde ser baixado.")
            }
            guard !videoData.isEmpty else { throw BridgeError.server("O vídeo recebido está vazio.") }
            guard videoData.count <= 250 * 1024 * 1024 else { throw BridgeError.videoTooLarge }

            lastVideoData = videoData
            lastProductURL = info.productUrl
            lastMetaAppId = (info.metaAppId?.isEmpty == false ? info.metaAppId : fallbackMetaAppId)
            lastTitle = info.title

            await openInstagramStory(videoData: videoData,
                                     productURL: info.productUrl,
                                     appId: lastMetaAppId ?? fallbackMetaAppId,
                                     title: info.title)
        } catch {
            status = readable(error)
            canRetry = lastVideoData != nil
        }
        isWorking = false
    }

    private func openInstagramStory(videoData: Data, productURL: String, appId: String, title: String) async {
        let encodedAppId = appId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? appId
        guard let instagramURL = URL(string: "instagram-stories://share?source_application=\(encodedAppId)") else {
            status = "Não foi possível montar o link do Instagram."
            canRetry = true
            return
        }

        guard UIApplication.shared.canOpenURL(instagramURL) else {
            status = "O Instagram não está instalado ou não permite abrir Stories neste iPhone."
            canRetry = true
            return
        }

        status = "Preparando o Story…"
        var pasteboardItem: [String: Any] = [
            "com.instagram.sharedSticker.backgroundVideo": videoData,
            "com.instagram.sharedSticker.backgroundTopColor": "#F5F6EF",
            "com.instagram.sharedSticker.backgroundBottomColor": "#171B16"
        ]

        if let url = URL(string: productURL), ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            pasteboardItem["com.instagram.sharedSticker.contentURL"] = productURL
            pasteboardItem["com.instagram.sharedSticker.linkURL"] = productURL
            pasteboardItem["com.instagram.sharedSticker.linkText"] = "Ver produto"
            // Mantém o endereço disponível no pasteboard como fallback para o adesivo Link.
            pasteboardItem["public.utf8-plain-text"] = productURL
        }

        UIPasteboard.general.setItems(
            [pasteboardItem],
            options: [.expirationDate: Date().addingTimeInterval(5 * 60)]
        )

        status = "Abrindo o editor de Stories do Instagram…"
        let opened = await withCheckedContinuation { continuation in
            UIApplication.shared.open(instagramURL, options: [:]) { success in
                continuation.resume(returning: success)
            }
        }

        if opened {
            status = "Story enviado ao Instagram. Finalize e publique no editor de Stories."
            canRetry = true
        } else {
            status = "O Instagram não abriu o editor de Stories. Toque em tentar novamente."
            canRetry = true
        }
    }

    private func readable(_ error: Error) -> String {
        if let bridge = error as? BridgeError { return bridge.message }
        if let urlError = error as? URLError {
            switch urlError.code {
            case .timedOut: return "O download do vídeo demorou demais. Gere um novo QR Code e tente novamente em uma conexão estável."
            case .notConnectedToInternet: return "O iPhone está sem conexão com a internet."
            default: return "Falha de rede ao preparar o Story: \(urlError.localizedDescription)"
            }
        }
        return "Não foi possível preparar o Story: \(error.localizedDescription)"
    }
}

enum BridgeError: Error {
    case invalidURL
    case videoTooLarge
    case server(String)

    var message: String {
        switch self {
        case .invalidURL: return "O link do Story é inválido. Gere um novo QR Code no Publisher."
        case .videoTooLarge: return "O vídeo é grande demais para o compartilhamento nativo."
        case .server(let message): return message
        }
    }
}
