import Foundation

/// 親アプリ: 地点詳細（ピン長押し）画面のロジック。
@MainActor
@Observable
public final class SpotDetailViewModel {
    public enum State {
        case loading
        case loaded(ScoreResponse)
        case failed(String)
    }

    public private(set) var state: State = .loading

    private let api: KakekomiAPI

    public init(apiBaseURL: String = "http://localhost:8787") {
        self.api = KakekomiAPI(baseURL: apiBaseURL)
    }

    public func load(lat: Double, lng: Double) async {
        state = .loading
        do {
            let response = try await api.fetchScore(lat: lat, lng: lng)
            state = .loaded(response)
        } catch {
            state = .failed("地点情報の取得に失敗しました")
        }
    }
}
