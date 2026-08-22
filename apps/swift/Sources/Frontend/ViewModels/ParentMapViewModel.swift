import Foundation
import CoreLocation

/// 親アプリ: マップ画面のロジック。選択中の子の自宅〜学校周辺の危険度グリッドを取得する。
@MainActor
@Observable
public final class ParentMapViewModel {
    public enum State {
        case idle
        case loading
        case loaded(cells: [GridCell], child: Child)
        case failed(String)
    }

    public private(set) var state: State = .idle

    private let api: KakekomiAPI

    public init(apiBaseURL: String = "http://localhost:8787") {
        self.api = KakekomiAPI(baseURL: apiBaseURL)
    }

    public func load(familyId: String, childId: String) async {
        state = .loading
        do {
            let children = try await api.fetchChildren(familyId: familyId).children
            guard let child = children.first(where: { $0.childId == childId }) else {
                state = .failed("お子さまの情報が見つかりません")
                return
            }
            let bbox = Self.bbox(home: child.home.clLocationCoordinate2D, school: child.school.clLocationCoordinate2D)
            let grid = try await api.fetchGrid(bbox: bbox)
            state = .loaded(cells: grid.cells, child: child)
        } catch {
            state = .failed("通学路の危険度取得に失敗しました")
        }
    }

    /// 自宅と学校の両方を含む範囲に、周囲マージンを加えたbboxを作る
    static func bbox(home: CLLocationCoordinate2D, school: CLLocationCoordinate2D) -> String {
        let margin = 0.003
        let minLat = min(home.latitude, school.latitude) - margin
        let maxLat = max(home.latitude, school.latitude) + margin
        let minLng = min(home.longitude, school.longitude) - margin
        let maxLng = max(home.longitude, school.longitude) + margin
        return "\(minLng),\(minLat),\(maxLng),\(maxLat)"
    }
}
