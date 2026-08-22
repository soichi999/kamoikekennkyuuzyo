import Foundation
import CoreLocation

/// 子アプリ: 現在地を取得してサーバーへ送信するロジック。
@MainActor
@Observable
public final class LocationSendViewModel {
    public enum State {
        case idle
        case locating
        case sending
        case sent(CurrentScore?)
        case failed(String)
    }

    public private(set) var state: State = .idle

    private let api: KakekomiAPI
    private let tracker: LocationTracker

    public init(apiBaseURL: String = "http://localhost:8787") {
        self.api = KakekomiAPI(baseURL: apiBaseURL)
        self.tracker = LocationTracker()
    }

    public func requestAuthorization() {
        tracker.requestAuthorization()
    }

    public func sendCurrentLocation(childId: String, familyId: String) async {
        state = .locating
        do {
            let current = try await tracker.requestCurrentLocation()
            state = .sending
            let point = LocationPoint(
                lat: current.coordinate.latitude,
                lng: current.coordinate.longitude,
                at: nil
            )
            let response = try await api.submitLocations(childId: childId, points: [point], familyId: familyId)
            state = .sent(response.current)
        } catch {
            state = .failed("位置情報の取得または送信に失敗しました")
        }
    }
}
