import SwiftUI

@main
struct RedeAchadosStoryBridgeApp: App {
    @StateObject private var bridge = StoryBridgeViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(bridge)
                .onOpenURL { url in
                    Task { await bridge.handle(url: url) }
                }
        }
    }
}
