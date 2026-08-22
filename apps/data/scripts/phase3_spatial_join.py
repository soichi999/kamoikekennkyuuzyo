"""Phase 3: 施設を町丁目に空間結合し、集計表を作る。

- 町丁目境界 (r2ka13.shp) を 23区に絞り、(CITY_NAME, S_NAME) で dissolve
- 施設（交番・学校・コンビニ）を 300m バッファ内でカウント
- 事件データ（phase2）を町丁目単位に集計
- 人口0の町丁目を除外
- 集計表を processed/phase3_summary.csv に保存
"""
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

WARDS = [
    "千代田区", "中央区", "港区", "新宿区", "文京区", "台東区", "墨田区",
    "江東区", "品川区", "目黒区", "大田区", "世田谷区", "渋谷区", "中野区",
    "杉並区", "豊島区", "北区", "荒川区", "板橋区", "練馬区", "足立区",
    "葛飾区", "江戸川区",
]

BUFFER_M = 300


def load_facilities(path, lon_col="lon", lat_col="lat"):
    df = pd.read_csv(path)
    df = df[df[lon_col].notna() & df[lat_col].notna()].copy()
    geom = [Point(x, y) for x, y in zip(df[lon_col], df[lat_col])]
    return gpd.GeoDataFrame(df, geometry=geom, crs="EPSG:4326").to_crs("EPSG:2451")


def count_within_buffer(polygons, points):
    """各ポリゴン（300mバッファ済み）内の点を数える。"""
    joined = gpd.sjoin(points, polygons, how="inner", predicate="within")
    counts = joined.groupby("index_right").size()
    return counts


def main():
    # 1. 町丁目境界を読み込み、23区に絞る
    gdf = gpd.read_file("raw/東京都人口/r2ka13.shp", encoding="cp932")
    gdf = gdf[gdf["CITY_NAME"].isin(WARDS)].copy()
    gdf = gdf[gdf["S_NAME"].notna()].copy()
    print(f"23区の町丁目ポリゴン: {len(gdf)}件")

    # 2. (CITY_NAME, S_NAME) で dissolve（人口合算、ジオメトリ統合）
    dissolved = gdf.dissolve(
        by=["CITY_NAME", "S_NAME"],
        aggfunc={"JINKO": "sum", "KEY_CODE": "first"},
    ).reset_index()
    print(f"dissolve後（町丁目単位）: {len(dissolved)}件")

    # 3. 施設を読み込み
    koban = load_facilities("processed/koban_geocoded.csv")
    school = load_facilities("processed/school_geocoded.csv")
    conveni = load_facilities("processed/conveni_osm.csv")
    print(f"交番: {len(koban)}件, 学校: {len(school)}件, コンビニ: {len(conveni)}件")

    # 4. 300m バッファ
    buffered = dissolved.copy()
    buffered["geometry"] = dissolved.geometry.buffer(BUFFER_M)

    # 5. 施設カウント
    dissolved["koban_n"] = count_within_buffer(buffered, koban).reindex(
        dissolved.index, fill_value=0
    ).values
    dissolved["school_n"] = count_within_buffer(buffered, school).reindex(
        dissolved.index, fill_value=0
    ).values
    dissolved["conveni_n"] = count_within_buffer(buffered, conveni).reindex(
        dissolved.index, fill_value=0
    ).values

    # 6. 事件データを町丁目単位に集計
    inc = pd.read_csv("processed/phase2_incidents_joined.csv")
    inc = inc[inc["matched"]].copy()
    inc_counts = inc.groupby(["CITY_NAME", "S_NAME"]).size().rename("incidents")
    dissolved = dissolved.merge(
        inc_counts, on=["CITY_NAME", "S_NAME"], how="left"
    )
    dissolved["incidents"] = dissolved["incidents"].fillna(0).astype(int)

    # 7. 人口0を除外
    before = len(dissolved)
    dissolved = dissolved[dissolved["JINKO"] > 0].copy()
    print(f"人口0除外: {before}件 → {len(dissolved)}件（除外 {before - len(dissolved)}件）")

    # 8. 面積（km2）
    dissolved["area_km2"] = dissolved.geometry.area / 1e6

    # 9. 保存
    out_cols = [
        "KEY_CODE", "CITY_NAME", "S_NAME", "JINKO",
        "koban_n", "school_n", "conveni_n", "incidents", "area_km2",
    ]
    dissolved[out_cols].to_csv("processed/phase3_summary.csv", index=False)
    print(f"保存: processed/phase3_summary.csv ({len(dissolved)}行)")

    # 10. 基本統計
    print()
    print("=== 基本統計 ===")
    for col in ["JINKO", "koban_n", "school_n", "conveni_n", "incidents"]:
        s = dissolved[col]
        print(f"{col:12s} 平均={s.mean():.2f} 最大={s.max():.0f} 0の個数={(s == 0).sum()}")


if __name__ == "__main__":
    main()
