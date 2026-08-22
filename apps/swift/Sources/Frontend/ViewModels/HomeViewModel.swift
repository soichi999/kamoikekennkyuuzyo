import Foundation

/// 親アプリ: ホーム画面のロジック。週間スコア推移と今日の危険ポイントを取得する。
@MainActor
@Observable
public final class HomeViewModel {
    public enum LoadState<T> {
        case idle
        case loading
        case loaded(T)
        case failed(String)
    }

    public private(set) var weeklyState: LoadState<WeeklyResponse> = .idle
    public private(set) var dailyState: LoadState<DailyResponse> = .idle

    private let api: KakekomiAPI

    public init(apiBaseURL: String = "http://localhost:8787") {
        self.api = KakekomiAPI(baseURL: apiBaseURL)
    }

    public func load(childId: String, familyId: String) async {
        weeklyState = .loading
        dailyState = .loading
        async let weekly = api.fetchWeekly(childId: childId, familyId: familyId)
        async let daily = api.fetchDaily(childId: childId, familyId: familyId)

        do {
            weeklyState = .loaded(try await weekly)
        } catch {
            weeklyState = .failed("スコア推移の取得に失敗しました")
        }
        do {
            dailyState = .loaded(try await daily)
        } catch {
            dailyState = .failed("今日の危険ポイントの取得に失敗しました")
        }
    }
}
