import SwiftUI
import Charts

/// 親アプリ: ホーム画面（タブ1）。
/// 子のスコア推移グラフと、今日の危険だったポイントリストを表示する。
public struct HomeView: View {
    @State private var viewModel: HomeViewModel
    @State private var selectedHotspot: Hotspot?

    private let childId: String
    private let familyId: String

    public init(
        childId: String,
        familyId: String,
        apiBaseURL: String = APIConfig.baseURL
    ) {
        self.childId = childId
        self.familyId = familyId
        _viewModel = State(initialValue: HomeViewModel(apiBaseURL: apiBaseURL))
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                weeklySection
                hotspotsSection
            }
            .padding()
        }
        .task {
            await viewModel.load(childId: childId, familyId: familyId)
        }
        .refreshable {
            await viewModel.load(childId: childId, familyId: familyId)
        }
        .sheet(item: $selectedHotspot) { hotspot in
            HotspotDetailView(hotspot: hotspot)
        }
    }

    // MARK: - スコア推移グラフ

    @ViewBuilder
    private var weeklySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("スコア推移")
                .font(.headline)

            switch viewModel.weeklyState {
            case .idle, .loading:
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 160)

            case .loaded(let weekly):
                Chart(weekly.days, id: \.date) { day in
                    if let score = day.totalScore {
                        LineMark(
                            x: .value("日付", day.date),
                            y: .value("スコア", score)
                        )
                        PointMark(
                            x: .value("日付", day.date),
                            y: .value("スコア", score)
                        )
                        .symbolSize(day.hasHotspot ? 120 : 40)
                        .foregroundStyle(color(for: day.level))
                    }
                }
                .chartYScale(domain: 0...100)
                .frame(height: 160)

                if let average = weekly.average {
                    Text("平均スコア: \(average)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

            case .failed(let message):
                Text(message)
                    .foregroundStyle(.red)
            }
        }
    }

    // MARK: - 今日の危険ポイントリスト

    @ViewBuilder
    private var hotspotsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("今日の危険だったポイント")
                .font(.headline)

            switch viewModel.dailyState {
            case .idle, .loading:
                ProgressView()

            case .loaded(let daily):
                if let hotspots = daily.hotspots, !hotspots.isEmpty {
                    VStack(spacing: 8) {
                        ForEach(hotspots.prefix(5)) { hotspot in
                            Button {
                                selectedHotspot = hotspot
                            } label: {
                                HotspotRow(hotspot: hotspot)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                } else {
                    Text(daily.message ?? "危険なポイントはありませんでした")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

            case .failed(let message):
                Text(message)
                    .foregroundStyle(.red)
            }
        }
    }

    private func color(for level: RiskLevel?) -> Color {
        switch level {
        case .safe: return .green
        case .caution: return .yellow
        case .danger: return .red
        case nil: return .gray
        }
    }
}

/// 危険ポイント1件分の行
private struct HotspotRow: View {
    let hotspot: Hotspot

    var body: some View {
        HStack {
            Circle()
                .fill(color)
                .frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 2) {
                Text(hotspot.title)
                    .font(.subheadline.bold())
                Text(hotspot.reason)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: 10))
    }

    private var color: Color {
        switch hotspot.level {
        case .safe: return .green
        case .caution: return .yellow
        case .danger: return .red
        }
    }
}

/// 危険ポイントの詳細（タップ時）
private struct HotspotDetailView: View {
    let hotspot: Hotspot

    var body: some View {
        NavigationStack {
            List {
                Section("概要") {
                    Text(hotspot.title).font(.headline)
                    Text(hotspot.reason)
                }
                Section("要因") {
                    ForEach(hotspot.factors) { factor in
                        VStack(alignment: .leading) {
                            Text(factor.label).bold()
                            Text(factor.detail).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                Section("滞在時間") {
                    Text("\(hotspot.stayMinutes)分")
                }
            }
            .navigationTitle("危険ポイント詳細")
        }
    }
}
