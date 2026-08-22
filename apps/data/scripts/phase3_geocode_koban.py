"""交番・駐在所を国土地理院APIでジオコーディングする。

- raw/交番場所.csv を読み、23区に絞る
- クエリは「東京都」+ 全体表記
- 結果を processed/koban_geocoded.csv に保存
- 進捗を途中保存し、再実行でレジューム可能
"""
import json
import time
import urllib.parse
import urllib.request

import pandas as pd

RAW = "raw/交番場所.csv"
OUT = "processed/koban_geocoded.csv"

WARDS = [
    "千代田区", "中央区", "港区", "新宿区", "文京区", "台東区", "墨田区",
    "江東区", "品川区", "目黒区", "大田区", "世田谷区", "渋谷区", "中野区",
    "杉並区", "豊島区", "北区", "荒川区", "板橋区", "練馬区", "足立区",
    "葛飾区", "江戸川区",
]

GSI_URL = "https://msearch.gsi.go.jp/address-search/AddressSearch?q="


def geocode(address: str):
    """GSI API で住所をジオコーディング。成功時 (lon, lat)、失敗時 None。"""
    url = GSI_URL + urllib.parse.quote(address)
    req = urllib.request.Request(url, headers={"User-Agent": "kakikomi-analysis"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read())
            if data:
                coords = data[0]["geometry"]["coordinates"]
                return coords[0], coords[1]  # [経度, 緯度]
            return None
        except Exception:
            time.sleep(1.0 * (attempt + 1))
    return None


def main():
    df = pd.read_csv(RAW)
    df = df[df["市区町村"].isin(WARDS)].copy()
    print(f"23区の交番・駐在所: {len(df)}件")

    df["query"] = "東京都" + df["全体表記"].astype(str)

    # レジューム
    import os
    if os.path.exists(OUT):
        done = pd.read_csv(OUT)
        done_keys = set(done["query"])
        print(f"既に処理済み: {len(done_keys)}件（レジューム）")
    else:
        done = pd.DataFrame()
        done_keys = set()

    results = []
    n = len(df)
    for i, (idx, row) in enumerate(df.iterrows()):
        q = row["query"]
        if q in done_keys:
            continue
        res = geocode(q)
        lon, lat = res if res else (None, None)
        results.append({
            "query": q,
            "市区町村": row["市区町村"],
            "全体表記": row["全体表記"],
            "lon": lon,
            "lat": lat,
        })
        if (i + 1) % 50 == 0:
            print(f"進捗: {i + 1}/{n}")
        time.sleep(0.3)

    if results:
        new = pd.DataFrame(results)
        done = pd.concat([done, new], ignore_index=True)
        done.to_csv(OUT, index=False)

    # 集計
    total = len(done)
    ok = done["lon"].notna().sum()
    print()
    print(f"=== ジオコーディング結果 ===")
    print(f"成功: {ok}/{total}件 ({ok / total * 100:.1f}%)")
    print(f"失敗: {total - ok}件")
    if total - ok:
        print(done[done["lon"].isna()][["市区町村", "全体表記"]].head(20).to_string())


if __name__ == "__main__":
    main()
