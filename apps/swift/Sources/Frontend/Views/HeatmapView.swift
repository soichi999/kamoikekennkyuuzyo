import SwiftUI
import MapKit

/// 子アプリ: ヒートマップ画面。自分の周りの危険度だけ見れるシンプルな1画面。
public struct HeatmapView: View {
    @State private var viewModel: HeatmapViewModel
    @State private var cameraPosition: MapCameraPosition

    private let center: CLLocationCoordinate2D

    public init(
        center: CLLocationCoordinate2D = CLLocationCoordinate2D(latitude: 35.6895, longitude: 139.6917),
        apiBaseURL: String = "http://localhost:8787"
    ) {
        self.center = center
        _viewModel = State(initialValue: HeatmapViewModel(apiBaseURL: apiBaseURL))
        _cameraPosition = State(initialValue: .region(
            MKCoordinateRegion(center: center, span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01))
        ))
    }

    public var body: some View {
        ZStack {
            switch viewModel.state {
            case .idle, .loading:
                Map(position: $cameraPosition)
                    .overlay { ProgressView() }

            case .loaded(let cells):
                Map(position: $cameraPosition) {
                    ForEach(Array(cells.enumerated()), id: \.offset) { _, cell in
                        Annotation("", coordinate: CLLocationCoordinate2D(latitude: cell.lat, longitude: cell.lng)) {
                            Circle()
                                .fill(color(for: cell.level))
                                .frame(width: 14, height: 14)
                                .opacity(0.75)
                        }
                    }
                }

            case .failed(let message):
                VStack(spacing: 12) {
                    Text(message).foregroundStyle(.red)
                    Button("再試行") {
                        Task { await viewModel.loadGrid(center: center) }
                    }
                }
            }
        }
        .task {
            await viewModel.loadGrid(center: center)
        }
    }

    private func color(for level: RiskLevel) -> Color {
        switch level {
        case .safe: return .green
        case .caution: return .yellow
        case .danger: return .red
        }
    }
}
