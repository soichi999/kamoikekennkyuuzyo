"""コンビニを OSM Overpass API で取得する（座標付き）。

- 23区の bbox で shop=convenience を取得
- 結果を processed/conveni_osm.csv に保存
"""
import json
import time
import urllib.parse
import urllib.request

import pandas as pd

OUT = "processed/conveni_osm.csv"
# 23区 bbox (south, west, north, east)
BBOX = (35.5209, 139.5629, 35.8175, 139.9211)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def fetch_bbox(south, west, north, east):
    query = (
        f'[out:json][timeout:180];'
        f'node["shop"="convenience"]({south},{west},{north},{east});'
        f'out body;'
    )
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(
        OVERPASS_URL, data=data, headers={"User-Agent": "kakikomi-analysis"}
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=200) as r:
                return json.loads(r.read())
        except Exception as e:
            print(f"retry {attempt + 1}: {e}")
            time.sleep(5 * (attempt + 1))
    return None


def main():
    j = fetch_bbox(*BBOX)
    if j is None:
        print("取得失敗")
        return

    elements = j.get("elements", [])
    print(f"取得ノード数: {len(elements)}")

    rows = []
    for e in elements:
        tags = e.get("tags", {})
        rows.append({
            "osm_id": e["id"],
            "lat": e["lat"],
            "lon": e["lon"],
            "name": tags.get("name", ""),
            "brand": tags.get("brand", ""),
        })

    df = pd.DataFrame(rows)
    df.to_csv(OUT, index=False)
    print(f"保存: {OUT}")
    print(f"ブランド内訳:")
    print(df["brand"].value_counts(dropna=False).head(10).to_string())


if __name__ == "__main__":
    main()
