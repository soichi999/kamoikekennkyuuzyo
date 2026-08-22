import Testing
import Foundation
@testable import Frontend

/// ホーム画面が使うAPIレスポンスのデコード検証。
/// APIサンプルは `apps/worker/API.md` のレスポンス例に準拠。
struct HomeDecodingTests {
    @Test func decodesWeeklyResponse() throws {
        let json = """
        {
          "child_id": "child_abc",
          "end": "2026-08-22",
          "days": [
            { "date": "2026-08-16", "total_score": 42, "level": "caution", "has_hotspot": false },
            { "date": "2026-08-17", "total_score": 78, "level": "danger", "has_hotspot": true }
          ],
          "average": 60,
          "baseline_score": 50
        }
        """.data(using: .utf8)!

        let decoded = try KakekomiAPI.iso8601Decoder.decode(WeeklyResponse.self, from: json)
        #expect(decoded.childId == "child_abc")
        #expect(decoded.days.count == 2)
        #expect(decoded.days[1].hasHotspot == true)
        #expect(decoded.average == 60)
    }

    @Test func decodesDailyResponseWithHotspots() throws {
        let json = """
        {
          "child_id": "child_abc",
          "date": "2026-08-22",
          "status": "ready",
          "total_score": 65,
          "level": "danger",
          "baseline_score": 40,
          "diff_from_baseline": 25,
          "hotspots": [
            {
              "hotspot_id": "hs_1",
              "lat": 35.6895,
              "lng": 139.6917,
              "score": 80,
              "level": "danger",
              "at": "2026-08-22T15:00:00+09:00",
              "title": "細い路地",
              "reason": "街灯が少なく人通りが少ない",
              "factors": [
                { "key": "lighting", "label": "照明", "impact": -20, "detail": "街灯が少ない" }
              ],
              "stay_minutes": 5
            }
          ],
          "summary": {
            "format": "v1",
            "for_parent": "今日は危険な場所がありました",
            "for_child": "気をつけてね",
            "talking_points": ["帰り道について話してみましょう"],
            "generated_at": "2026-08-22T22:00:00+09:00",
            "model": "template"
          },
          "stats": {
            "distance_m": 1200,
            "duration_min": 20,
            "point_count": 30,
            "departed_at": "2026-08-22T15:00:00+09:00",
            "arrived_at": "2026-08-22T15:20:00+09:00"
          }
        }
        """.data(using: .utf8)!

        let decoded = try KakekomiAPI.iso8601Decoder.decode(DailyResponse.self, from: json)
        #expect(decoded.status == "ready")
        #expect(decoded.hotspots?.count == 1)
        #expect(decoded.hotspots?.first?.title == "細い路地")
        #expect(decoded.summary?.forParent == "今日は危険な場所がありました")
    }
}
