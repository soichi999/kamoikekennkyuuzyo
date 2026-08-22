// Frontend: 画面表示・入出力を担当するモジュール

import Backend

public struct Frontend {
    private let backend: Backend
    private let api: KakekomiAPI

    public init(backend: Backend = Backend(), apiBaseURL: String = "http://localhost:8787") {
        self.backend = backend
        self.api = KakekomiAPI(baseURL: apiBaseURL)
    }

    public func run() {
        print(backend.greet())
    }

    public func createPairing() async throws -> PairingCreateResponse {
        try await api.createPairing()
    }
}
