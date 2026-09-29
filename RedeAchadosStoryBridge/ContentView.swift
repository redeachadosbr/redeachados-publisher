import SwiftUI

struct ContentView: View {
    @EnvironmentObject var bridge: StoryBridgeViewModel

    var body: some View {
        NavigationStack {
            VStack(spacing: 22) {
                Spacer(minLength: 24)

                Text("RA")
                    .font(.system(size: 34, weight: .black))
                    .foregroundStyle(Color(red: 0.82, green: 0.67, blue: 0.28))
                    .frame(width: 86, height: 86)
                    .background(Color(red: 0.11, green: 0.13, blue: 0.10))
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))

                VStack(spacing: 7) {
                    Text("REDE ACHADOS BR")
                        .font(.headline)
                    Text("Story Bridge")
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 12) {
                    if bridge.isWorking {
                        ProgressView()
                            .controlSize(.large)
                    }
                    Text(bridge.status)
                        .font(.body)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                }
                .padding(18)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                if bridge.canRetry {
                    Button("Tentar abrir o Story novamente") {
                        Task { await bridge.retry() }
                    }
                    .buttonStyle(.borderedProminent)
                }

                Text("Use o QR Code do Publisher. Ao tocar em “Abrir direto no Story do Instagram”, este auxiliar baixa o vídeo temporário e abre o editor de Stories do Instagram com o conteúdo carregado.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Spacer()
            }
            .padding(22)
            .navigationTitle("Story no Instagram")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
