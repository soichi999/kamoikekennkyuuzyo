import SwiftUI
import MapKit

/// 子アプリ: ヒートマップ画面。自分の周りの危険度だけ見れるシンプルな1画面。
/// childId/familyIdが渡された場合は、現在地を送信して最新スコアを反映するボタンも表示する。
public struct HeatmapView: View {
    @State private var viewModel: HeatmapViewModel
    @State private var locationViewModel: LocationSendViewModel
    @State private var cameraPosition: MapCameraPosition

    private let center: CLLocationCoordinate2D
    private let childId: String?
    private let familyId: String?

    public init(
        center: CLLocationCoordinate2D = CLLocationCoordinate2D(latitude: 35.6895, longitude: 139.6917),
        childId: String? = nil,
        familyId: String? = nil,
        apiBaseURL: String = "http://localhost:8787"
    ) {
        self.center = center
        self.childId = childId
        self.familyId = familyId
        _viewModel = State(initialValue: HeatmapViewModel(apiBaseURL: apiBaseURL))
        _locationViewModel = State(initialValue: LocationSendViewModel(apiBaseURL: apiBaseURL))
        _cameraPosition = State(initialValue: .region(
            MKCoordinateRegion(center: center, span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01))
        ))
    }

    public var body: some View {
        ZStack(alignment: .bottom) {
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

            if let childId, let familyId {
                locationSendBar(childId: childId, familyId: familyId)
            }
        }
        .task {
            await viewModel.loadGrid(center: center)
            locationViewModel.requestAuthorization()
        }
    }

    @ViewBuilder
    private func locationSendBar(childId: String, familyId: String) -> some View {
        VStack(spacing: 8) {
            switch locationViewModel.state {
            case .idle:
                Button("今の場所を送信") {
                    Task {
                        await locationViewModel.sendCurrentLocation(childId: childId, familyId: familyId)
                        await viewModel.loadGrid(center: center)
                    }
                }
                .buttonStyle(.borderedProminent)

            case .locating, .sending:
                ProgressView().padding(8)

            case .sent(let current):
                HStack {
                    if let current {
                        Circle().fill(color(for: current.level)).frame(width: 10, height: 10)
                        Text("現在地スコア: \(current.score)")
                    } else {
                        Text("送信しました")
                    }
                    Button("再送信") {
                        Task {
                            await locationViewModel.sendCurrentLocation(childId: childId, familyId: familyId)
                            await viewModel.loadGrid(center: center)
                        }
                    }
                }
                .font(.footnote)

            case .failed(let message):
                VStack(spacing: 4) {
                    Text(message).font(.footnote).foregroundStyle(.red)
                    Button("再試行") {
                        Task { await locationViewModel.sendCurrentLocation(childId: childId, familyId: familyId) }
                    }
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding()
    }

    private func color(for level: RiskLevel) -> Color {
        switch level {
        case .safe: return .green
        case .caution: return .yellow
        case .danger: return .red
        }
    }
}
