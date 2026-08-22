import Foundation
import CoreLocation

/// 子アプリ: ヒートマップ画面のロジック。現在地周辺の危険度グリッドを取得する。
@MainActor
@Observable
public final class HeatmapViewModel {
    public enum State {
        case idle
        case loading
        case loaded([GridCell])
        case failed(String)
    }

    public private(set) var state: State = .idle

    private let api: KakekomiAPI

    public init(apiBaseURL: String = "http://localhost:8787") {
        self.api = KakekomiAPI(baseURL: apiBaseURL)
    }

    /// 中心座標から一辺約1kmのbboxでグリッドスコアを取得する
    public func loadGrid(center: CLLocationCoordinate2D) async {
        state = .loading
        let deltaDeg = 0.005
        let bbox = "\(center.longitude - deltaDeg),\(center.latitude - deltaDeg),\(center.longitude + deltaDeg),\(center.latitude + deltaDeg)"
        do {
            let response = try await api.fetchGrid(bbox: bbox)
            state = .loaded(response.cells)
        } catch {
            state = .failed("危険度データの取得に失敗しました")
        }
    }
}
