import Foundation

/// 親アプリ: 子ども一覧画面のロジック。
@MainActor
@Observable
public final class ChildrenViewModel {
    public enum State {
        case idle
        case loading
        case loaded([Child])
        case failed(String)
    }

    public private(set) var state: State = .idle

    private let api: KakekomiAPI

    public init(apiBaseURL: String = APIConfig.baseURL) {
        self.api = KakekomiAPI(baseURL: apiBaseURL)
    }

    public func load(familyId: String) async {
        state = .loading
        do {
            let response = try await api.fetchChildren(familyId: familyId)
            state = .loaded(response.children)
        } catch {
            state = .failed("子ども一覧の取得に失敗しました")
        }
    }
}
