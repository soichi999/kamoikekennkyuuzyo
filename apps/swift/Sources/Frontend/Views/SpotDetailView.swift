import SwiftUI

/// 親アプリ: ピン長押しの地点詳細画面。
public struct SpotDetailView: View {
    @State private var viewModel: SpotDetailViewModel

    private let lat: Double
    private let lng: Double

    public init(lat: Double, lng: Double, apiBaseURL: String = APIConfig.baseURL) {
        self.lat = lat
        self.lng = lng
        _viewModel = State(initialValue: SpotDetailViewModel(apiBaseURL: apiBaseURL))
    }

    public var body: some View {
        NavigationStack {
            Group {
                switch viewModel.state {
                case .loading:
                    ProgressView()

                case .loaded(let score):
                    List {
                        Section {
                            HStack {
                                Circle().fill(color(for: score.level)).frame(width: 12, height: 12)
                                Text(score.title).font(.headline)
                                Spacer()
                                Text("\(score.score)").font(.title3.bold())
                            }
                            Text(score.reason)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }

                        Section("要因") {
                            ForEach(score.factors) { factor in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(factor.label).bold()
                                    Text(factor.detail)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }

                        if !score.nearestRefuge.isEmpty {
                            Section("最寄りの駆け込み先") {
                                ForEach(Array(score.nearestRefuge.enumerated()), id: \.offset) { _, refuge in
                                    HStack {
                                        Text(refuge.name)
                                        Spacer()
                                        Text("\(refuge.distanceM)m")
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }

                case .failed(let message):
                    VStack(spacing: 12) {
                        Text(message).foregroundStyle(.red)
                        Button("再試行") {
                            Task { await viewModel.load(lat: lat, lng: lng) }
                        }
                    }
                }
            }
            .navigationTitle("地点の詳細")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
        }
        .task {
            await viewModel.load(lat: lat, lng: lng)
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
