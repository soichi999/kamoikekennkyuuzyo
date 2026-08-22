import SwiftUI

/// 親アプリ: 初回セットアップ画面。「コードを発行」ボタン→6桁コードを表示する。
public struct ParentPairingView: View {
    @State private var viewModel: ParentPairingViewModel
    @Environment(AppSession.self) private var session

    public init(apiBaseURL: String = APIConfig.baseURL) {
        _viewModel = State(initialValue: ParentPairingViewModel(apiBaseURL: apiBaseURL))
    }

    public var body: some View {
        VStack(spacing: 24) {
            Text("お子さまとペアリング")
                .font(.title2.bold())

            switch viewModel.state {
            case .idle:
                Button("コードを発行") {
                    Task { await viewModel.issueCode() }
                }
                .buttonStyle(.borderedProminent)

            case .loading:
                ProgressView()

            case .issued(let pairing):
                VStack(spacing: 12) {
                    Text(pairing.code)
                        .font(.system(size: 48, weight: .bold, design: .monospaced))
                        .tracking(8)
                    Text("お子さまの端末でこのコードを入力してください")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .onAppear {
                    session.setFamilyId(pairing.familyId)
                }

            case .failed(let message):
                VStack(spacing: 12) {
                    Text(message)
                        .foregroundStyle(.red)
                    Button("再試行") {
                        Task { await viewModel.issueCode() }
                    }
                }
            }
        }
        .padding()
    }
}
