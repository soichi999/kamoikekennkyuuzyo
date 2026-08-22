import Foundation
import CoreLocation

// MARK: - RiskLevel

/// リスクレベル。どの画面でも使用する共通型
public enum RiskLevel: String, Codable, Sendable {
    case safe, caution, danger

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        self = RiskLevel(rawValue: raw) ?? .caution
    }
}

// MARK: - エラーモデル

/// APIエラー。全画面でエラーハンドリングに使用
public struct APIErrorResponse: Decodable, Sendable {
    public let error: APIErrorDetail
}

public struct APIErrorDetail: Decodable, Sendable {
    public let code: String
    public let message: String
}

// MARK: - Pairing

/// ペアリング作成レスポンス。親アプリのペアリング画面で使用
public struct PairingCreateResponse: Codable, Sendable {
    public let code: String
    public let familyId: String
    public let expiresAt: String
    public let qrPayload: String

    enum CodingKeys: String, CodingKey {
        case code
        case familyId = "family_id"
        case expiresAt = "expires_at"
        case qrPayload = "qr_payload"
    }

    public var expiresAtDate: Date? { parseKakekomiDate(expiresAt) }
}

/// ペアリング消費リクエスト。子アプリのペアリング画面で使用
public struct PairingRedeemRequest: Codable, Sendable {
    public let code: String
    public let childName: String?

    enum CodingKeys: String, CodingKey {
        case code
        case childName = "child_name"
    }
}

/// ペアリング消費レスポンス。子アプリのペアリング完了画面で使用
public struct PairingRedeemResponse: Codable, Sendable {
    public let familyId: String
    public let childId: String
    public let name: String
    public let pairedAt: String

    enum CodingKeys: String, CodingKey {
        case familyId = "family_id"
        case childId = "child_id"
        case name
        case pairedAt = "paired_at"
    }

    public var pairedAtDate: Date? { parseKakekomiDate(pairedAt) }
}

// MARK: - Family / Children

/// 子どもの情報。親アプリの子ども一覧画面で使用
public struct Child: Codable, Identifiable, Hashable, Sendable {
    public let childId: String
    public let name: String
    public let grade: String
    public let home: Coordinate
    public let school: Coordinate
    public let pairedAt: String

    public var id: String { childId }

    enum CodingKeys: String, CodingKey {
        case childId = "child_id"
        case name, grade, home, school
        case pairedAt = "paired_at"
    }

    public var pairedAtDate: Date? { parseKakekomiDate(pairedAt) }
}

public struct ChildrenResponse: Codable, Sendable {
    public let children: [Child]
}

// MARK: - Coordinate

/// 座標モデル。複数の画面で使用
public struct Coordinate: Codable, Hashable, Sendable {
    public let lat: Double
    public let lng: Double

    public var clLocationCoordinate2D: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }
}

// MARK: - Factor

/// スコア要因。地点詳細スコア画面とlocations結果で使用
public struct Factor: Codable, Identifiable, Hashable, Sendable {
    public let key: String
    public let label: String
    public let impact: Int
    public let detail: String

    public var id: String { key }
}

// MARK: - Locations

/// 位置情報送信リクエスト。子アプリの位置送信画面で使用
public struct LocationPoint: Codable, Sendable {
    public let lat: Double
    public let lng: Double
    public let at: String?
}

public struct LocationRequest: Codable, Sendable {
    public let childId: String
    public let points: [LocationPoint]

    enum CodingKeys: String, CodingKey {
        case childId = "child_id"
        case points
    }
}

/// 位置情報送信レスポンスの個別結果
public struct LocationResult: Codable, Hashable, Sendable {
    public let lat: Double
    public let lng: Double
    public let at: String
    public let score: Int
    public let level: RiskLevel
    public let factors: [Factor]

    public var atDate: Date? { parseKakekomiDate(at) }
}

/// 位置情報送信レスポンスの現在地スコア
public struct CurrentScore: Codable, Hashable, Sendable {
    public let score: Int
    public let level: RiskLevel
}

/// 位置情報送信レスポンス。子アプリの結果画面で使用
public struct LocationResponse: Codable, Sendable {
    public let accepted: Int
    public let results: [LocationResult]
    public let current: CurrentScore?
}

// MARK: - Grid

/// ヒートマップグリッドのセル。子アプリのマップ画面で使用
public struct GridCell: Codable, Hashable, Sendable {
    public let lat: Double
    public let lng: Double
    public let score: Int
    public let level: RiskLevel
}

/// グリッドレスポンス。子アプリのマップ画面で使用
public struct GridResponse: Codable, Sendable {
    public let cellSizeM: Int
    public let at: String
    public let count: Int
    public let cells: [GridCell]

    enum CodingKeys: String, CodingKey {
        case cellSizeM = "cell_size_m"
        case at, count, cells
    }

    public var atDate: Date? { parseKakekomiDate(at) }
}

// MARK: - Score

/// 単発スコアの最寄り駆け込み先。地点詳細画面で使用
public struct NearestRefuge: Codable, Hashable, Sendable {
    public let type: String
    public let name: String
    public let distanceM: Int

    enum CodingKeys: String, CodingKey {
        case type, name
        case distanceM = "distance_m"
    }
}

/// 単発スコアレスポンス。ピン長押しの地点詳細画面で使用
public struct ScoreResponse: Codable, Sendable {
    public let lat: Double
    public let lng: Double
    public let at: String
    public let score: Int
    public let level: RiskLevel
    public let factors: [Factor]
    public let title: String
    public let reason: String
    public let nearestRefuge: [NearestRefuge]

    enum CodingKeys: String, CodingKey {
        case lat, lng, at, score, level, factors, title, reason
        case nearestRefuge = "nearest_refuge"
    }

    public var atDate: Date? { parseKakekomiDate(at) }
}

// MARK: - Daily

/// 日次結果のホットスポット。今日の危険ポイント画面で使用
public struct Hotspot: Codable, Identifiable, Hashable, Sendable {
    public let hotspotId: String
    public let lat: Double
    public let lng: Double
    public let score: Int
    public let level: RiskLevel
    public let at: String
    public let title: String
    public let reason: String
    public let factors: [Factor]
    public let stayMinutes: Int

    public var id: String { hotspotId }

    enum CodingKeys: String, CodingKey {
        case hotspotId = "hotspot_id"
        case lat, lng, score, level, at, title, reason, factors
        case stayMinutes = "stay_minutes"
    }

    public var atDate: Date? { parseKakekomiDate(at) }
}

/// 日次結果のサマリー。今日の危険ポイント画面で使用
public struct DailySummary: Codable, Hashable, Sendable {
    public let format: String
    public let forParent: String
    public let forChild: String
    public let talkingPoints: [String]
    public let generatedAt: String
    public let model: String

    enum CodingKeys: String, CodingKey {
        case format
        case forParent = "for_parent"
        case forChild = "for_child"
        case talkingPoints = "talking_points"
        case generatedAt = "generated_at"
        case model
    }

    public var generatedAtDate: Date? { parseKakekomiDate(generatedAt) }
}

/// 日次結果の統計情報。今日の危険ポイント画面で使用
public struct DailyStats: Codable, Hashable, Sendable {
    public let distanceM: Int
    public let durationMin: Int
    public let pointCount: Int
    public let departedAt: String
    public let arrivedAt: String

    enum CodingKeys: String, CodingKey {
        case distanceM = "distance_m"
        case durationMin = "duration_min"
        case pointCount = "point_count"
        case departedAt = "departed_at"
        case arrivedAt = "arrived_at"
    }

    public var departedAtDate: Date? { parseKakekomiDate(departedAt) }
    public var arrivedAtDate: Date? { parseKakekomiDate(arrivedAt) }
}

/// 日次結果の軌跡ポイント
public struct TrackPoint: Codable, Hashable, Sendable {
    public let lat: Double
    public let lng: Double
    public let at: String

    public var atDate: Date? { parseKakekomiDate(at) }
}

/// 日次結果レスポンス。今日の危険ポイント画面で使用
public struct DailyResponse: Codable, Sendable {
    public let childId: String?
    public let date: String?
    public let status: String?
    public let message: String?
    public let totalScore: Int?
    public let level: RiskLevel?
    public let baselineScore: Int?
    public let diffFromBaseline: Int?
    public let track: [TrackPoint]?
    public let hotspots: [Hotspot]?
    public let summary: DailySummary?
    public let stats: DailyStats?

    enum CodingKeys: String, CodingKey {
        case childId = "child_id"
        case date, status, message
        case totalScore = "total_score"
        case level
        case baselineScore = "baseline_score"
        case diffFromBaseline = "diff_from_baseline"
        case track, hotspots, summary, stats
    }
}

// MARK: - Weekly

/// 週間グラフの1日分。週間グラフ画面で使用
public struct DayScore: Codable, Hashable, Sendable {
    public let date: String
    public let totalScore: Int?
    public let level: RiskLevel?
    public let hasHotspot: Bool

    enum CodingKeys: String, CodingKey {
        case date
        case totalScore = "total_score"
        case level
        case hasHotspot = "has_hotspot"
    }
}

/// 週間グラフレスポンス。週間グラフ画面で使用
public struct WeeklyResponse: Codable, Sendable {
    public let childId: String
    public let end: String
    public let days: [DayScore]
    public let average: Int?
    public let baselineScore: Int?

    enum CodingKeys: String, CodingKey {
        case childId = "child_id"
        case end, days, average
        case baselineScore = "baseline_score"
    }
}

// MARK: - ヘルスチェック

/// ヘルスチェックレスポンス
public struct HealthResponse: Codable, Sendable {
    public let app: String
    public let version: String
    public let phase: String
    public let endpoints: [String]
    public let scoringImpl: String
    public let aiProvider: String

    enum CodingKeys: String, CodingKey {
        case app, version, phase, endpoints
        case scoringImpl = "scoring_impl"
        case aiProvider = "ai_provider"
    }
}

// MARK: - Admin

/// 管理者向け日次集計実行レスポンス
public struct AdminAggregateResponse: Codable, Sendable {
    public let ok: Bool
    public let childId: String
    public let date: String

    enum CodingKeys: String, CodingKey {
        case ok
        case childId = "child_id"
        case date
    }
}

// MARK: - API Client

/// ISO8601文字列（小数秒あり/なし両対応）を`Date`に変換する共通パーサー。
/// サーバーの日時フィールドは全て `String` のまま保持し(レスポンス形はAPI仕様書の通り)、
/// 画面側で `Date` が欲しい箇所はこの関数、または各モデルの `xxxDate` computed property を使う。
public func parseKakekomiDate(_ string: String) -> Date? {
    let fmts = [
        "yyyy-MM-dd'T'HH:mm:ss.SSSZZZZZ",
        "yyyy-MM-dd'T'HH:mm:ssZZZZZ",
        "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
        "yyyy-MM-dd'T'HH:mm:ssZ",
    ]
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    for fmt in fmts {
        formatter.dateFormat = fmt
        if let date = formatter.date(from: string) {
            return date
        }
    }
    return nil
}

/// カケコミAPIクライアント。全画面で通信に使用
public actor KakekomiAPI {
    public let baseURL: String
    public let session: URLSession

    public init(baseURL: String = "https://kakekomi-api.example.com") {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)
    }

    // MARK: - Date Decoding Strategy

    public static let iso8601Decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            if let date = parseKakekomiDate(str) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot parse date: \(str)"
            )
        }
        return decoder
    }()

    public static let iso8601Encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        encoder.dateEncodingStrategy = .formatted(formatter)
        return encoder
    }()

    // MARK: - Private Helpers

    private func request(path: String, method: String = "GET", body: Data? = nil, familyId: String? = nil) -> URLRequest {
        let url = URL(string: baseURL + path)!
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        if let familyId = familyId {
            req.setValue(familyId, forHTTPHeaderField: "X-Family-Id")
        }
        return req
    }

    private func perform<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, _) = try await session.data(for: req)
        return try Self.iso8601Decoder.decode(T.self, from: data)
    }

    private func performVoid(_ req: URLRequest) async throws {
        let (_, _) = try await session.data(for: req)
    }

    // MARK: - ペアリング作成（親アプリ）

    public func createPairing() async throws -> PairingCreateResponse {
        let req = request(path: "/v1/pairing/create", method: "POST")
        return try await perform(req)
    }

    // MARK: - ペアリング消費（子アプリ）

    public func redeemPairing(code: String, childName: String? = nil) async throws -> PairingRedeemResponse {
        let body = try JSONEncoder().encode(PairingRedeemRequest(code: code, childName: childName))
        let req = request(path: "/v1/pairing/redeem", method: "POST", body: body)
        return try await perform(req)
    }

    // MARK: - 子ども一覧（親アプリ）

    public func fetchChildren(familyId: String) async throws -> ChildrenResponse {
        let req = request(path: "/v1/family/\(familyId)/children", familyId: familyId)
        return try await perform(req)
    }

    // MARK: - 位置情報送信（子アプリ）

    public func submitLocations(childId: String, points: [LocationPoint], familyId: String) async throws -> LocationResponse {
        let body = try JSONEncoder().encode(LocationRequest(childId: childId, points: points))
        let req = request(path: "/v1/locations", method: "POST", body: body, familyId: familyId)
        return try await perform(req)
    }

    // MARK: - ヒートマップグリッド（子アプリ）

    public func fetchGrid(bbox: String, zoom: Int? = nil, at: String? = nil) async throws -> GridResponse {
        var path = "/v1/grid?bbox=\(bbox)"
        if let zoom = zoom { path += "&zoom=\(zoom)" }
        if let at = at { path += "&at=\(at)" }
        let req = request(path: path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? path)
        return try await perform(req)
    }

    // MARK: - 単発スコア（ピン長押し）

    public func fetchScore(lat: Double, lng: Double, at: String? = nil) async throws -> ScoreResponse {
        var path = "/v1/score?lat=\(lat)&lng=\(lng)"
        if let at = at { path += "&at=\(at)" }
        let req = request(path: path)
        return try await perform(req)
    }

    // MARK: - 日次結果（今日の危険ポイント）

    public func fetchDaily(childId: String, date: String? = nil, familyId: String) async throws -> DailyResponse {
        var path = "/v1/children/\(childId)/daily"
        if let date = date { path += "?date=\(date)" }
        let req = request(path: path, familyId: familyId)
        return try await perform(req)
    }

    // MARK: - 週間グラフ

    public func fetchWeekly(childId: String, end: String? = nil, familyId: String) async throws -> WeeklyResponse {
        var path = "/v1/children/\(childId)/weekly"
        if let end = end { path += "?end=\(end)" }
        let req = request(path: path, familyId: familyId)
        return try await perform(req)
    }

    // MARK: - ヘルスチェック

    public func health() async throws -> HealthResponse {
        let req = request(path: "/v1")
        return try await perform(req)
    }

    // MARK: - 管理者: 日次集計手動実行

    public func adminAggregate(childId: String, date: String, adminToken: String) async throws -> AdminAggregateResponse {
        var req = request(path: "/v1/admin/aggregate", method: "POST", body: try JSONEncoder().encode(["child_id": childId, "date": date]))
        req.setValue("Bearer \(adminToken)", forHTTPHeaderField: "Authorization")
        return try await perform(req)
    }
}
