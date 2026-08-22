"""Phase 2: 事件データ（不審者・声かけ）を町丁目境界に結合する。

- 事件データを「不審者・声かけ事案」に絞る
- 丁目レベルの行のみ使用（番地に「丁目」を含む）
- 番地の丁目番号を漢数字に変換し、町名 + 漢数字 + 丁目 で S_NAME を組み立てる
- ケ/ヶ の表記ゆれを「ケ」に正規化
- 町丁目境界 (r2ka13.shp) と (CITY_NAME, S_NAME) で結合
- 結合率を表示する
"""
import re
import pandas as pd
import geopandas as gpd

RAW_CRIME = "raw/CRIME RAW DATA.csv"
RAW_SHP = "raw/東京都人口/r2ka13.shp"

WARDS = [
    "千代田区", "中央区", "港区", "新宿区", "文京区", "台東区", "墨田区",
    "江東区", "品川区", "目黒区", "大田区", "世田谷区", "渋谷区", "中野区",
    "杉並区", "豊島区", "北区", "荒川区", "板橋区", "練馬区", "足立区",
    "葛飾区", "江戸川区",
]

KANSUJI = {
    "0": "〇", "1": "一", "2": "二", "3": "三", "4": "四",
    "5": "五", "6": "六", "7": "七", "8": "八", "9": "九",
}
ZENKAKU = str.maketrans("０１２３４５６７８９", "0123456789")
KEGAKI = str.maketrans("ヶ", "ケ")


def normalize_chome(banchi: str) -> str:
    """番地から丁目番号を抽出し、漢数字に変換して「N丁目」を返す。"""
    s = str(banchi).strip().translate(ZENKAKU)
    m = re.match(r"^(\d+)丁目", s)
    if not m:
        return None
    num = m.group(1)
    kansuji = "".join(KANSUJI[c] for c in num)
    return kansuji + "丁目"


def main():
    df = pd.read_csv(RAW_CRIME)

    # 1. 不審者・声かけ事案に絞る
    sub = df[df["カレゴリ"] == "不審者・声かけ事案"].copy()
    print(f"不審者・声かけ事案: {len(sub)}件")

    # 2. 丁目レベルの行のみ
    sub = sub[sub["番地"].astype(str).str.contains("丁目", na=False)].copy()
    print(f"丁目レベル: {len(sub)}件")

    # 3. 丁目番号を漢数字に変換
    sub["chome"] = sub["番地"].apply(normalize_chome)
    bad = sub[sub["chome"].isna()]
    print(f"丁目番号の抽出に失敗: {len(bad)}件")
    if len(bad):
        print(bad[["市区町村", "町名", "番地"]].head(20).to_string())

    sub = sub[sub["chome"].notna()].copy()

    # 4. S_NAME を組み立てる（ケ/ヶ を正規化）
    sub["S_NAME"] = sub["町名"].astype(str).str.translate(KEGAKI) + sub["chome"]
    sub["CITY_NAME"] = sub["市区町村"]

    # 5. 町丁目境界を読み込み
    gdf = gpd.read_file(RAW_SHP, encoding="cp932")
    gdf = gdf[gdf["S_NAME"].notna()].copy()
    gdf["S_NAME"] = gdf["S_NAME"].str.translate(KEGAKI)

    # 6. 結合（ユニークな (CITY_NAME, S_NAME) で判定）
    valid = set(zip(gdf["CITY_NAME"], gdf["S_NAME"]))
    sub["matched"] = sub.apply(
        lambda r: (r["CITY_NAME"], r["S_NAME"]) in valid, axis=1
    )

    n_total = len(sub)
    n_match = int(sub["matched"].sum())
    rate = n_match / n_total * 100
    print()
    print("=== 結合結果（ユニーク事件ベース） ===")
    print(f"結合成功: {n_match}/{n_total}件 ({rate:.1f}%)")
    print(f"結合失敗: {n_total - n_match}件")

    unmatched = sub[~sub["matched"]]
    if rate < 80:
        print()
        print("=== 結合失敗した住所サンプル20件 ===")
        print(unmatched[["市区町村", "町名", "番地", "S_NAME"]].head(20).to_string())
    else:
        print()
        print("=== 結合失敗した住所（全件） ===")
        print(unmatched[["市区町村", "町名", "番地", "S_NAME"]].to_string())

    # 23区に限定した場合の件数
    in_wards = sub[sub["CITY_NAME"].isin(WARDS)]
    print()
    print(f"23区に限定: {len(in_wards)}件（うち結合成功 {int(in_wards['matched'].sum())}件）")

    # 荒川区
    arakawa = sub[sub["CITY_NAME"] == "荒川区"]
    print(f"荒川区: {len(arakawa)}件（うち結合成功 {int(arakawa['matched'].sum())}件）")


if __name__ == "__main__":
    main()
