// Frontend: 画面表示・入出力を担当するモジュール

import Backend

public struct Frontend {
    private let backend: Backend

    public init(backend: Backend = Backend()) {
        self.backend = backend
    }

    public func run() {
        print(backend.greet())
    }
}
