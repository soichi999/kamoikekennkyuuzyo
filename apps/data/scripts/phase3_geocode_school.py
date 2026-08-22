"""学校（4ファイル）を国土地理院APIでジオコーディングする。

- 使用ファイル: 小学校 / 中学校 / 義務教育学校 / 中等教育学校
- 23区に絞る（設置者 or 住所から区を判定）
- 区名補完して「東京都 + 区 + 住所」のクエリを組み立てる
- 結果を processed/school_geocoded.csv に保存
"""
import json
import os
import time
import urllib.parse
import urllib.request

import pandas as pd

BASE = "raw/学校/"
FILES = [
    ("shougakkou-address_4.csv", "小学校"),
    ("chuugakkou-address_3.csv", "中学校"),
    ("gimu-address_3.csv", "義務教育学校"),
    ("chuutou-address_3.csv", "中等教育学校"),
]
OUT = "processed/school_geocoded.csv"

WARDS = [
    "千代田区", "中央区", "港区", "新宿区", "文京区", "台東区", "墨田区",
    "江東区", "品川区", "目黒区", "大田区", "世田谷区", "渋谷区", "中野区",
    "杉並区", "豊島区", "北区", "荒川区", "板橋区", "練馬区", "足立区",
    "葛飾区", "江戸川区",
]

GSI_URL = "https://msearch.gsi.go.jp/address-search/AddressSearch?q="


def geocode(address: str):
    url = GSI_URL + urllib.parse.quote(address)
    req = urllib.request.Request(url, headers={"User-Agent": "kakikomi-analysis"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read())
            if data:
                coords = data[0]["geometry"]["coordinates"]
                return coords[0], coords[1]
            return None
        except Exception:
            time.sleep(1.0 * (attempt + 1))
    return None


def determine_ward(addr: str, setter: str):
    """区を判定する。23区でなければ None。"""
    for w in WARDS:
        if addr.startswith(w):
            return w
    if setter in WARDS:
        return setter
    return None


def main():
    rows = []
    for fn, school_type in FILES:
        df = pd.read_csv(BASE + fn, encoding="cp932")
        for _, r in df.iterrows():
            addr = str(r["住所"]).strip()
            setter = str(r["設置者"]).strip()
            ward = determine_ward(addr, setter)
            if ward is None:
                continue
            if addr.startswith(ward):
                query = "東京都" + addr
            else:
                query = "東京都" + ward + addr
            rows.append({
                "school_type": school_type,
                "学校名": r["学校名"],
                "設置者": setter,
                "住所": addr,
                "ward": ward,
                "query": query,
            })

    df = pd.DataFrame(rows)
    print(f"23区の学校（4ファイル）: {len(df)}件")

    # レジューム
    if os.path.exists(OUT):
        done = pd.read_csv(OUT)
        done_keys = set(done["query"])
        print(f"既に処理済み: {len(done_keys)}件（レジューム）")
    else:
        done = pd.DataFrame()
        done_keys = set()

    results = []
    n = len(df)
    for i, (_, row) in enumerate(df.iterrows()):
        q = row["query"]
        if q in done_keys:
            continue
        res = geocode(q)
        lon, lat = res if res else (None, None)
        results.append({
            "school_type": row["school_type"],
            "学校名": row["学校名"],
            "ward": row["ward"],
            "住所": row["住所"],
            "query": q,
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

    total = len(done)
    ok = done["lon"].notna().sum()
    print()
    print("=== ジオコーディング結果 ===")
    print(f"成功: {ok}/{total}件 ({ok / total * 100:.1f}%)")
    print(f"失敗: {total - ok}件")
    if total - ok:
        print(done[done["lon"].isna()][["ward", "住所"]].head(20).to_string())


if __name__ == "__main__":
    main()
