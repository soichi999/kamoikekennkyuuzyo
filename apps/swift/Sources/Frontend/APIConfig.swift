import Foundation

/// APIの接続先設定。環境変数 `KAMOIKE_API_BASE_URL` で本番/ローカルを切り替えられる。
public enum APIConfig {
    public static var baseURL: String {
        ProcessInfo.processInfo.environment["KAMOIKE_API_BASE_URL"] ?? "http://localhost:8787"
    }
}
