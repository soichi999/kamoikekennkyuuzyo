import Foundation

/// 子アプリ: コード入力画面のロジック。6桁コードを送信してペアリングを完了する。
@MainActor
@Observable
public final class ChildPairingViewModel {
    public enum State {
        case idle
        case loading
        case paired(PairingRedeemResponse)
        case failed(String)
    }

    public private(set) var state: State = .idle
    public var code: String = ""

    private let api: KakekomiAPI

    public init(apiBaseURL: String = "http://localhost:8787") {
        self.api = KakekomiAPI(baseURL: apiBaseURL)
    }

    public func redeem(onPaired: (PairingRedeemResponse) -> Void = { _ in }) async {
        guard code.count == 6 else {
            state = .failed("6桁のコードを入力してください")
            return
        }
        state = .loading
        do {
            let response = try await api.redeemPairing(code: code)
            state = .paired(response)
            onPaired(response)
        } catch {
            state = .failed("コードが正しくないか、有効期限が切れています")
        }
    }
}
