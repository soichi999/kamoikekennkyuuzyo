import SwiftUI
import Frontend

/// デモ用ルート画面。親/子の役割を切り替えて核となる画面を確認する。
struct RootView: View {
    private enum Mode: String, CaseIterable, Identifiable {
        case parentHome = "親: ホーム"
        case parentPairing = "親: コード発行"
        case childPairing = "子: コード入力"
        case heatmap = "子: ヒートマップ"

        var id: String { rawValue }
    }

    @State private var mode: Mode = .parentHome

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
                HomeView(childId: "demo-child", familyId: "demo-family")
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
    }
}
