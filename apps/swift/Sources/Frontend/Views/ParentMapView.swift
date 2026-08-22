import SwiftUI
import MapKit

/// 親アプリ: マップ画面（タブ2）。
/// 通学路を安全（緑）/注意（黄）/危険（赤）の3段階で色分け表示し、自宅・学校を地点マーカーで示す。
public struct ParentMapView: View {
    @State private var viewModel: ParentMapViewModel
    @State private var cameraPosition: MapCameraPosition = .automatic
    @Environment(AppSession.self) private var session

    public init(apiBaseURL: String = "http://localhost:8787") {
        _viewModel = State(initialValue: ParentMapViewModel(apiBaseURL: apiBaseURL))
    }

    public var body: some View {
        Group {
            switch viewModel.state {
            case .idle, .loading:
                ProgressView()

            case .loaded(let cells, let child):
                Map(position: $cameraPosition) {
                    ForEach(Array(cells.enumerated()), id: \.offset) { _, cell in
                        Annotation("", coordinate: CLLocationCoordinate2D(latitude: cell.lat, longitude: cell.lng)) {
                            Circle()
                                .fill(color(for: cell.level))
                                .frame(width: 14, height: 14)
                                .opacity(0.75)
                        }
                    }
                    Marker("自宅", systemImage: "house.fill", coordinate: child.home.clLocationCoordinate2D)
                        .tint(.blue)
                    Marker("学校", systemImage: "graduationcap.fill", coordinate: child.school.clLocationCoordinate2D)
                        .tint(.indigo)
                }
                .onAppear {
                    let bbox = ParentMapViewModel.bbox(
                        home: child.home.clLocationCoordinate2D,
                        school: child.school.clLocationCoordinate2D
                    )
                    cameraPosition = .region(Self.region(fromBBox: bbox))
                }

            case .failed(let message):
                VStack(spacing: 12) {
                    Text(message).foregroundStyle(.red)
                    Button("再試行") {
                        if let familyId = session.familyId, let childId = session.selectedChildId {
                            Task { await viewModel.load(familyId: familyId, childId: childId) }
                        }
                    }
                }
            }
        }
        .task {
            if let familyId = session.familyId, let childId = session.selectedChildId {
                await viewModel.load(familyId: familyId, childId: childId)
            }
        }
    }

    private func color(for level: RiskLevel) -> Color {
        switch level {
        case .safe: return .green
        case .caution: return .yellow
        case .danger: return .red
        }
    }

    private static func region(fromBBox bbox: String) -> MKCoordinateRegion {
        let parts = bbox.split(separator: ",").compactMap { Double($0) }
        guard parts.count == 4 else {
            return MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 35.6895, longitude: 139.6917),
                span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
            )
        }
        let (minLng, minLat, maxLng, maxLat) = (parts[0], parts[1], parts[2], parts[3])
        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2),
            span: MKCoordinateSpan(latitudeDelta: max(maxLat - minLat, 0.01), longitudeDelta: max(maxLng - minLng, 0.01))
        )
    }
}
