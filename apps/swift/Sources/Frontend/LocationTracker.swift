import Foundation
import CoreLocation

/// 子アプリ: 端末の位置情報を取得するラッパー。CLLocationManagerDelegateをasync/awaitで扱えるようにする。
@MainActor
public final class LocationTracker: NSObject {
    public enum AuthorizationState {
        case notDetermined
        case denied
        case authorized
    }

    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation, Error>?

    public private(set) var authorizationState: AuthorizationState = .notDetermined

    public override init() {
        super.init()
        manager.delegate = self
    }

    public func requestAuthorization() {
        #if os(iOS)
        manager.requestWhenInUseAuthorization()
        #endif
    }

    /// 現在地を1回取得する
    public func requestCurrentLocation() async throws -> CLLocation {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            manager.requestLocation()
        }
    }
}

extension LocationTracker: CLLocationManagerDelegate {
    public nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in
            continuation?.resume(returning: location)
            continuation = nil
        }
    }

    public nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            continuation?.resume(throwing: error)
            continuation = nil
        }
    }

    public nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            switch status {
            case .authorizedAlways, .authorizedWhenInUse:
                authorizationState = .authorized
            case .denied, .restricted:
                authorizationState = .denied
            default:
                authorizationState = .notDetermined
            }
        }
    }
}
