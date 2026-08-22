import SwiftUI
import Frontend

/// デモ用ルート画面。親/子の役割を切り替えて核となる画面を確認する。
struct RootView: View {
    private enum Mode: String, CaseIterable, Identifiable {
        case parentHome = "親: ホーム"
        case parentMap = "親: マップ"
        case childrenList = "親: 子ども一覧"
        case parentPairing = "親: コード発行"
        case childPairing = "子: コード入力"
        case heatmap = "子: ヒートマップ"

        var id: String { rawValue }
    }

    @State private var mode: Mode = .parentHome
    @State private var session = AppSession()

    var body: some View {
        VStack(spacing: 0) {
            Picker("画面", selection: $mode) {
                ForEach(Mode.allCases) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .padding()

            switch mode {
            case .parentHome:
                if let familyId = session.familyId, let childId = session.selectedChildId {
                    HomeView(childId: childId, familyId: familyId)
                } else {
                    unpairedPlaceholder
                }
            case .parentMap:
                if session.familyId != nil, session.selectedChildId != nil {
                    ParentMapView()
                } else {
                    unpairedPlaceholder
                }
            case .childrenList:
                if session.familyId != nil {
                    ChildrenListView()
                } else {
                    unpairedPlaceholder
                }
            case .parentPairing:
                ParentPairingView()
            case .childPairing:
                ChildPairingView { response in
                    print("ペアリング完了: child_id=\(response.childId)")
                }
            case .heatmap:
                HeatmapView()
            }
        }
        .environment(session)
    }

    @ViewBuilder
    private var unpairedPlaceholder: some View {
        ContentUnavailableView(
            "まだペアリングされていません",
            systemImage: "person.2.slash",
            description: Text("「親: コード発行」→「子: コード入力」→「親: 子ども一覧」の順に進めてください")
        )
    }
}
