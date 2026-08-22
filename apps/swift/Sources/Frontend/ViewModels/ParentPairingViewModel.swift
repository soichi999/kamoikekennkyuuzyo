import Foundation

/// 親アプリ: 初回セットアップ画面のロジック。「コードを発行」ボタン押下で6桁コードを取得する。
@MainActor
@Observable
public final class ParentPairingViewModel {
    public enum State {
        case idle
        case loading
        case issued(PairingCreateResponse)
        case failed(String)
    }

    public private(set) var state: State = .idle

    private let api: KakekomiAPI

    public init(apiBaseURL: String = APIConfig.baseURL) {
        self.api = KakekomiAPI(baseURL: apiBaseURL)
    }

    public func issueCode() async {
        state = .loading
        do {
            let response = try await api.createPairing()
            state = .issued(response)
        } catch {
            state = .failed("コード発行に失敗しました。通信環境を確認してください。")
        }
    }
}
