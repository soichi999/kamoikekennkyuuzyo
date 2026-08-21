import Foundation
import CoreLocation

// MARK: - RiskLevel

/// リスクレベル。どの画面でも使用する共通型
enum RiskLevel: String, Codable {
    case safe, caution, danger

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        self = RiskLevel(rawValue: raw) ?? .caution
    }
}

// MARK: - エラーモデル

/// APIエラー。全画面でエラーハンドリングに使用
struct APIErrorResponse: Decodable {
    let error: APIErrorDetail
}

struct APIErrorDetail: Decodable {
    let code: String
    let message: String
}

// MARK: - Pairing

/// ペアリング作成レスポンス。親アプリのペアリング画面で使用
struct PairingCreateResponse: Codable {
    let code: String
    let familyId: String
    let expiresAt: String
    let qrPayload: String

    enum CodingKeys: String, CodingKey {
        case code
        case familyId = "family_id"
        case expiresAt = "expires_at"
        case qrPayload = "qr_payload"
    }

    var expiresAtDate: Date? { parseKakekomiDate(expiresAt) }
}

/// ペアリング消費リクエスト。子アプリのペアリング画面で使用
struct PairingRedeemRequest: Codable {
    let code: String
    let childName: String?

    enum CodingKeys: String, CodingKey {
        case code
        case childName = "child_name"
    }
}

/// ペアリング消費レスポンス。子アプリのペアリング完了画面で使用
struct PairingRedeemResponse: Codable {
    let familyId: String
    let childId: String
    let name: String
    let pairedAt: String

    enum CodingKeys: String, CodingKey {
        case familyId = "family_id"
        case childId = "child_id"
        case name
        case pairedAt = "paired_at"
    }

    var pairedAtDate: Date? { parseKakekomiDate(pairedAt) }
}

// MARK: - Family / Children

/// 子どもの情報。親アプリの子ども一覧画面で使用
struct Child: Codable, Identifiable, Hashable {
    let childId: String
    let name: String
    let grade: String
    let home: Coordinate
    let school: Coordinate
    let pairedAt: String

    var id: String { childId }

    enum CodingKeys: String, CodingKey {
        case childId = "child_id"
        case name, grade, home, school
        case pairedAt = "paired_at"
    }

    var pairedAtDate: Date? { parseKakekomiDate(pairedAt) }
}

struct ChildrenResponse: Codable {
    let children: [Child]
}

// MARK: - Coordinate

/// 座標モデル。複数の画面で使用
struct Coordinate: Codable, Hashable {
    let lat: Double
    let lng: Double

    var clLocationCoordinate2D: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }
}

// MARK: - Factor

/// スコア要因。地点詳細スコア画面とlocations結果で使用
struct Factor: Codable, Identifiable, Hashable {
    let key: String
    let label: String
    let impact: Int
    let detail: String

    var id: String { key }
}

// MARK: - Locations

/// 位置情報送信リクエスト。子アプリの位置送信画面で使用
struct LocationPoint: Codable {
    let lat: Double
    let lng: Double
    let at: String?
}

struct LocationRequest: Codable {
    let childId: String
    let points: [LocationPoint]

    enum CodingKeys: String, CodingKey {
        case childId = "child_id"
        case points
    }
}

/// 位置情報送信レスポンスの個別結果
struct LocationResult: Codable, Hashable {
    let lat: Double
    let lng: Double
    let at: String
    let score: Int
    let level: RiskLevel
    let factors: [Factor]

    var atDate: Date? { parseKakekomiDate(at) }
}

/// 位置情報送信レスポンスの現在地スコア
struct CurrentScore: Codable, Hashable {
    let score: Int
    let level: RiskLevel
}

/// 位置情報送信レスポンス。子アプリの結果画面で使用
struct LocationResponse: Codable {
    let accepted: Int
    let results: [LocationResult]
    let current: CurrentScore?
}

// MARK: - Grid

/// ヒートマップグリッドのセル。子アプリのマップ画面で使用
struct GridCell: Codable, Hashable {
    let lat: Double
    let lng: Double
    let score: Int
    let level: RiskLevel
}

/// グリッドレスポンス。子アプリのマップ画面で使用
struct GridResponse: Codable {
    let cellSizeM: Int
    let at: String
    let count: Int
    let cells: [GridCell]

    enum CodingKeys: String, CodingKey {
        case cellSizeM = "cell_size_m"
        case at, count, cells
    }

    var atDate: Date? { parseKakekomiDate(at) }
}

// MARK: - Score

/// 単発スコアの最寄り駆け込み先。地点詳細画面で使用
struct NearestRefuge: Codable, Hashable {
    let type: String
    let name: String
    let distanceM: Int

    enum CodingKeys: String, CodingKey {
        case type, name
        case distanceM = "distance_m"
    }
}

/// 単発スコアレスポンス。ピン長押しの地点詳細画面で使用
struct ScoreResponse: Codable {
    let lat: Double
    let lng: Double
    let at: String
    let score: Int
    let level: RiskLevel
    let factors: [Factor]
    let title: String
    let reason: String
    let nearestRefuge: [NearestRefuge]

    enum CodingKeys: String, CodingKey {
        case lat, lng, at, score, level, factors, title, reason
        case nearestRefuge = "nearest_refuge"
    }

    var atDate: Date? { parseKakekomiDate(at) }
}

// MARK: - Daily

/// 日次結果のホットスポット。今日の危険ポイント画面で使用
struct Hotspot: Codable, Identifiable, Hashable {
    let hotspotId: String
    let lat: Double
    let lng: Double
    let score: Int
    let level: RiskLevel
    let at: String
    let title: String
    let reason: String
    let factors: [Factor]
    let stayMinutes: Int

    var id: String { hotspotId }

    enum CodingKeys: String, CodingKey {
        case hotspotId = "hotspot_id"
        case lat, lng, score, level, at, title, reason, factors
        case stayMinutes = "stay_minutes"
    }

    var atDate: Date? { parseKakekomiDate(at) }
}

/// 日次結果のサマリー。今日の危険ポイント画面で使用
struct DailySummary: Codable, Hashable {
    let format: String
    let forParent: String
    let forChild: String
    let talkingPoints: [String]
    let generatedAt: String
    let model: String

    enum CodingKeys: String, CodingKey {
        case format
        case forParent = "for_parent"
        case forChild = "for_child"
        case talkingPoints = "talking_points"
        case generatedAt = "generated_at"
        case model
    }

    var generatedAtDate: Date? { parseKakekomiDate(generatedAt) }
}

/// 日次結果の統計情報。今日の危険ポイント画面で使用
struct DailyStats: Codable, Hashable {
    let distanceM: Int
    let durationMin: Int
    let pointCount: Int
    let departedAt: String
    let arrivedAt: String

    enum CodingKeys: String, CodingKey {
        case distanceM = "distance_m"
        case durationMin = "duration_min"
        case pointCount = "point_count"
        case departedAt = "departed_at"
        case arrivedAt = "arrived_at"
    }

    var departedAtDate: Date? { parseKakekomiDate(departedAt) }
    var arrivedAtDate: Date? { parseKakekomiDate(arrivedAt) }
}

/// 日次結果の軌跡ポイント
struct TrackPoint: Codable, Hashable {
    let lat: Double
    let lng: Double
    let at: String

    var atDate: Date? { parseKakekomiDate(at) }
}

/// 日次結果レスポンス。今日の危険ポイント画面で使用
struct DailyResponse: Codable {
    let childId: String?
    let date: String?
    let status: String?
    let message: String?
    let totalScore: Int?
    let level: RiskLevel?
    let baselineScore: Int?
    let diffFromBaseline: Int?
    let track: [TrackPoint]?
    let hotspots: [Hotspot]?
    let summary: DailySummary?
    let stats: DailyStats?

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
struct DayScore: Codable, Hashable {
    let date: String
    let totalScore: Int?
    let level: RiskLevel?
    let hasHotspot: Bool

    enum CodingKeys: String, CodingKey {
        case date
        case totalScore = "total_score"
        case level
        case hasHotspot = "has_hotspot"
    }
}

/// 週間グラフレスポンス。週間グラフ画面で使用
struct WeeklyResponse: Codable {
    let childId: String
    let end: String
    let days: [DayScore]
    let average: Int?
    let baselineScore: Int?

    enum CodingKeys: String, CodingKey {
        case childId = "child_id"
        case end, days, average
        case baselineScore = "baseline_score"
    }
}

// MARK: - ヘルスチェック

/// ヘルスチェックレスポンス
struct HealthResponse: Codable {
    let app: String
    let version: String
    let phase: String
    let endpoints: [String]
    let scoringImpl: String
    let aiProvider: String

    enum CodingKeys: String, CodingKey {
        case app, version, phase, endpoints
        case scoringImpl = "scoring_impl"
        case aiProvider = "ai_provider"
    }
}

// MARK: - Admin

/// 管理者向け日次集計実行レスポンス
struct AdminAggregateResponse: Codable {
    let ok: Bool
    let childId: String
    let date: String

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
func parseKakekomiDate(_ string: String) -> Date? {
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
actor KakekomiAPI {
    let baseURL: String
    let session: URLSession

    init(baseURL: String = "https://kakekomi-api.example.com") {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)
    }

    // MARK: - Date Decoding Strategy

    static let iso8601Decoder: JSONDecoder = {
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

    static let iso8601Encoder: JSONEncoder = {
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

    func createPairing() async throws -> PairingCreateResponse {
        let req = request(path: "/v1/pairing/create", method: "POST")
        return try await perform(req)
    }

    // MARK: - ペアリング消費（子アプリ）

    func redeemPairing(code: String, childName: String? = nil) async throws -> PairingRedeemResponse {
        let body = try JSONEncoder().encode(PairingRedeemRequest(code: code, childName: childName))
        let req = request(path: "/v1/pairing/redeem", method: "POST", body: body)
        return try await perform(req)
    }

    // MARK: - 子ども一覧（親アプリ）

    func fetchChildren(familyId: String) async throws -> ChildrenResponse {
        let req = request(path: "/v1/family/\(familyId)/children", familyId: familyId)
        return try await perform(req)
    }

    // MARK: - 位置情報送信（子アプリ）

    func submitLocations(childId: String, points: [LocationPoint], familyId: String) async throws -> LocationResponse {
        let body = try JSONEncoder().encode(LocationRequest(childId: childId, points: points))
        let req = request(path: "/v1/locations", method: "POST", body: body, familyId: familyId)
        return try await perform(req)
    }

    // MARK: - ヒートマップグリッド（子アプリ）

    func fetchGrid(bbox: String, zoom: Int? = nil, at: String? = nil) async throws -> GridResponse {
        var path = "/v1/grid?bbox=\(bbox)"
        if let zoom = zoom { path += "&zoom=\(zoom)" }
        if let at = at { path += "&at=\(at)" }
        let req = request(path: path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? path)
        return try await perform(req)
    }

    // MARK: - 単発スコア（ピン長押し）

    func fetchScore(lat: Double, lng: Double, at: String? = nil) async throws -> ScoreResponse {
        var path = "/v1/score?lat=\(lat)&lng=\(lng)"
        if let at = at { path += "&at=\(at)" }
        let req = request(path: path)
        return try await perform(req)
    }

    // MARK: - 日次結果（今日の危険ポイント）

    func fetchDaily(childId: String, date: String? = nil, familyId: String) async throws -> DailyResponse {
        var path = "/v1/children/\(childId)/daily"
        if let date = date { path += "?date=\(date)" }
        let req = request(path: path, familyId: familyId)
        return try await perform(req)
    }

    // MARK: - 週間グラフ

    func fetchWeekly(childId: String, end: String? = nil, familyId: String) async throws -> WeeklyResponse {
        var path = "/v1/children/\(childId)/weekly"
        if let end = end { path += "?end=\(end)" }
        let req = request(path: path, familyId: familyId)
        return try await perform(req)
    }

    // MARK: - ヘルスチェック

    func health() async throws -> HealthResponse {
        let req = request(path: "/v1")
        return try await perform(req)
    }

    // MARK: - 管理者: 日次集計手動実行

    func adminAggregate(childId: String, date: String, adminToken: String) async throws -> AdminAggregateResponse {
        var req = request(path: "/v1/admin/aggregate", method: "POST", body: try JSONEncoder().encode(["child_id": childId, "date": date]))
        req.setValue("Bearer \(adminToken)", forHTTPHeaderField: "Authorization")
        return try await perform(req)
    }
}
