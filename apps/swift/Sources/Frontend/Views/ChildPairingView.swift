import SwiftUI

/// 子アプリ: コード入力画面。6桁コードを入力→送信でペアリング完了する。
public struct ChildPairingView: View {
    @State private var viewModel: ChildPairingViewModel
    private let onPaired: (PairingRedeemResponse) -> Void

    public init(
        apiBaseURL: String = APIConfig.baseURL,
        onPaired: @escaping (PairingRedeemResponse) -> Void = { _ in }
    ) {
        _viewModel = State(initialValue: ChildPairingViewModel(apiBaseURL: apiBaseURL))
        self.onPaired = onPaired
    }

    public var body: some View {
        VStack(spacing: 24) {
            Text("おうちの人からもらった\n6桁のコードを入力してね")
                .multilineTextAlignment(.center)
                .font(.title3.bold())

            TextField("123456", text: $viewModel.code)
                .font(.system(size: 40, weight: .bold, design: .monospaced))
                .multilineTextAlignment(.center)
                #if os(iOS)
                .keyboardType(.numberPad)
                #endif
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 240)

            switch viewModel.state {
            case .idle, .paired:
                Button("送信") {
                    Task { await viewModel.redeem(onPaired: onPaired) }
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.code.count != 6)

            case .loading:
                ProgressView()

            case .failed(let message):
                VStack(spacing: 12) {
                    Text(message).foregroundStyle(.red)
                    Button("送信") {
                        Task { await viewModel.redeem(onPaired: onPaired) }
                    }
                }
            }
        }
        .padding()
    }
}
