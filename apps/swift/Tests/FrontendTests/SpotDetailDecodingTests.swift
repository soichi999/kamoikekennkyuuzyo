import Testing
import Foundation
@testable import Frontend

/// 地点詳細（ピン長押し）画面が使うScoreResponseのデコード検証。
struct SpotDetailDecodingTests {
    @Test func decodesScoreResponse() throws {
        let json = """
        {
          "lat": 35.6895,
          "lng": 139.6917,
          "at": "2026-08-23T15:00:00+09:00",
          "score": 72,
          "level": "danger",
          "factors": [
            { "key": "lighting", "label": "照明", "impact": -20, "detail": "街灯が少ない" }
          ],
          "title": "細い路地",
          "reason": "街灯が少なく人通りが少ない",
          "nearest_refuge": [
            { "type": "koban", "name": "○○交番", "distance_m": 150 }
          ]
        }
        """.data(using: .utf8)!

        let decoded = try KakekomiAPI.iso8601Decoder.decode(ScoreResponse.self, from: json)
        #expect(decoded.score == 72)
        #expect(decoded.level == .danger)
        #expect(decoded.nearestRefuge.first?.name == "○○交番")
    }
}
