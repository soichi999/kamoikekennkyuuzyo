"""Phase 4（修正版）: 距離ベースのポアソン回帰。

交番・コンビニのカウントが都市化と交絡して逆符号になったため、モデルを修正。

- 交番・学校は「最寄りまでの距離」で測る
- 都市化を pop_density で明示的にコントロール
- コンビニは密度（数/面積）で測る

log(λ) = offset(log JINKO)
       + β1*log(dist_koban_m)
       + β2*log(dist_school_m)
       + β3*log(pop_density)
       + β4*log(conveni_density + 1)
       + 区ダミー
"""
import numpy as np
import pandas as pd
import geopandas as gpd
import statsmodels.api as sm
from scipy.spatial import cKDTree
from shapely.geometry import Point

WARDS = [
    "千代田区", "中央区", "港区", "新宿区", "文京区", "台東区", "墨田区",
    "江東区", "品川区", "目黒区", "大田区", "世田谷区", "渋谷区", "中野区",
    "杉並区", "豊島区", "北区", "荒川区", "板橋区", "練馬区", "足立区",
    "葛飾区", "江戸川区",
]


def load_points(path, lon_col="lon", lat_col="lat"):
    df = pd.read_csv(path)
    df = df[df[lon_col].notna() & df[lat_col].notna()].copy()
    geom = [Point(x, y) for x, y in zip(df[lon_col], df[lat_col])]
    return gpd.GeoDataFrame(df, geometry=geom, crs="EPSG:4326").to_crs("EPSG:2451")


def nearest_distance(centroids, points):
    """各重心から最寄り点までの距離（m）を返す。"""
    tree = cKDTree(np.array([[p.x, p.y] for p in points.geometry]))
    dists, _ = tree.query(np.array([[c.x, c.y] for c in centroids]), k=1)
    return dists


def main():
    # 1. 町丁目境界を dissolve
    gdf = gpd.read_file("raw/東京都人口/r2ka13.shp", encoding="cp932")
    gdf = gdf[gdf["CITY_NAME"].isin(WARDS)].copy()
    gdf = gdf[gdf["S_NAME"].notna()].copy()
    dissolved = gdf.dissolve(
        by=["CITY_NAME", "S_NAME"],
        aggfunc={"JINKO": "sum", "KEY_CODE": "first"},
    ).reset_index()
    dissolved = dissolved[dissolved["JINKO"] > 0].copy()

    # 2. 重心
    dissolved["centroid"] = dissolved.geometry.centroid
    dissolved["area_km2"] = dissolved.geometry.area / 1e6

    # 3. 施設を読み込み
    koban = load_points("processed/koban_geocoded.csv")
    school = load_points("processed/school_geocoded.csv")
    conveni = load_points("processed/conveni_osm.csv")

    # 4. 最寄り距離
    dissolved["dist_koban_m"] = nearest_distance(dissolved["centroid"], koban)
    dissolved["dist_school_m"] = nearest_distance(dissolved["centroid"], school)

    # 5. コンビニ密度（ポリゴン内の数 / 面積）
    conveni_in = gpd.sjoin(conveni, dissolved, how="inner", predicate="within")
    conveni_count = conveni_in.groupby("index_right").size()
    dissolved["conveni_in_n"] = conveni_count.reindex(
        dissolved.index, fill_value=0
    ).values
    dissolved["conveni_density"] = dissolved["conveni_in_n"] / dissolved["area_km2"]

    # 6. 人口密度
    dissolved["pop_density"] = dissolved["JINKO"] / dissolved["area_km2"]

    # 7. 事件データを結合
    inc = pd.read_csv("processed/phase2_incidents_joined.csv")
    inc = inc[inc["matched"]].copy()
    inc_counts = inc.groupby(["CITY_NAME", "S_NAME"]).size().rename("incidents")
    dissolved = dissolved.merge(inc_counts, on=["CITY_NAME", "S_NAME"], how="left")
    dissolved["incidents"] = dissolved["incidents"].fillna(0).astype(int)

    # 8. 学習/検証に分割
    train = dissolved[dissolved["CITY_NAME"] != "荒川区"].copy()
    test = dissolved[dissolved["CITY_NAME"] == "荒川区"].copy()
    print(f"学習（22区）: {len(train)}町丁目, incidents {train['incidents'].sum()}件")
    print(f"検証（荒川区）: {len(test)}町丁目, incidents {test['incidents'].sum()}件")

    # 9. 特徴量（log変換、距離0は1mにクリップ）
    train["log_dist_koban"] = np.log(np.clip(train["dist_koban_m"], 1, None))
    train["log_dist_school"] = np.log(np.clip(train["dist_school_m"], 1, None))
    train["log_pop_density"] = np.log(train["pop_density"])
    train["log_conveni_density"] = np.log(train["conveni_density"] + 1)

    ward_dummies = pd.get_dummies(train["CITY_NAME"], prefix="ward", drop_first=True).astype(int)

    X = pd.concat(
        [
            train[["log_dist_koban", "log_dist_school", "log_pop_density", "log_conveni_density"]],
            ward_dummies,
        ],
        axis=1,
    )
    X = sm.add_constant(X)

    offset = np.log(train["JINKO"])

    model = sm.GLM(
        train["incidents"],
        X,
        family=sm.families.Poisson(),
        offset=offset,
    )
    result = model.fit()

    print()
    print("=== 修正モデルの係数 ===")
    coef_table = pd.DataFrame({
        "coef": result.params,
        "std_err": result.bse,
        "z": result.tvalues,
        "p_value": result.pvalues,
    })
    print(coef_table.to_string())

    print()
    print("=== 距離変数の符号（正 = 遠いほど事件が多い = 仮説支持） ===")
    for var, label in [
        ("log_dist_koban", "交番までの距離"),
        ("log_dist_school", "学校までの距離"),
    ]:
        c = result.params[var]
        p = result.pvalues[var]
        sign = "正" if c > 0 else "負"
        support = "仮説支持" if c > 0 else "仮説と逆"
        print(f"{label:12s} coef={c:+.4f}  p={p:.4f}  ({sign}) {support}")

    print()
    print("=== 都市化コントロール ===")
    for var, label in [
        ("log_pop_density", "人口密度"),
        ("log_conveni_density", "コンビニ密度"),
    ]:
        c = result.params[var]
        p = result.pvalues[var]
        print(f"{label:12s} coef={c:+.4f}  p={p:.4f}")

    print()
    print(f"対数尤度: {result.llf:.2f}")
    print(f"AIC: {result.aic:.2f}")
    print(f"観測数: {result.nobs}")

    coef_table.to_csv("processed/phase4_coefficients_v2.csv")
    print()
    print("保存: processed/phase4_coefficients_v2.csv")


if __name__ == "__main__":
    main()
