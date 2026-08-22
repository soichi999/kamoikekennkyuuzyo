import SwiftUI

/// 親アプリ: 子ども一覧画面。複数の子がいる場合の切り替え用。
public struct ChildrenListView: View {
    @State private var viewModel: ChildrenViewModel
    @Environment(AppSession.self) private var session

    public init(apiBaseURL: String = APIConfig.baseURL) {
        _viewModel = State(initialValue: ChildrenViewModel(apiBaseURL: apiBaseURL))
    }

    public var body: some View {
        Group {
            switch viewModel.state {
            case .idle, .loading:
                ProgressView()

            case .loaded(let children):
                if children.isEmpty {
                    ContentUnavailableView(
                        "お子さまが未登録です",
                        systemImage: "person.crop.circle.badge.plus",
                        description: Text("子ども用アプリでコードを入力してもらってください")
                    )
                } else {
                    List(children) { child in
                        Button {
                            session.selectChild(child.childId)
                        } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(child.name).font(.headline)
                                    Text(child.grade).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if session.selectedChildId == child.childId {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.blue)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }

            case .failed(let message):
                VStack(spacing: 12) {
                    Text(message).foregroundStyle(.red)
                    Button("再試行") {
                        if let familyId = session.familyId {
                            Task { await viewModel.load(familyId: familyId) }
                        }
                    }
                }
            }
        }
        .task {
            if let familyId = session.familyId {
                await viewModel.load(familyId: familyId)
            }
        }
    }
}
