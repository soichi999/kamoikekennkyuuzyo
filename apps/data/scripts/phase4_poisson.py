"""Phase 4: ポアソン回帰で危険度係数を推定する。

- 学習: 22区（荒川区を除く）
- モデル: 件数 ~ Poisson(λ), log(λ) = offset(log 人口) + β1*koban_n + β2*school_n + β3*conveni_n + 区ダミー
- 係数・標準誤差・p値の表を出す
"""
import numpy as np
import pandas as pd
import statsmodels.api as sm

SUMMARY = "processed/phase3_summary.csv"


def main():
    df = pd.read_csv(SUMMARY)

    # 学習/検証に分割
    train = df[df["CITY_NAME"] != "荒川区"].copy()
    test = df[df["CITY_NAME"] == "荒川区"].copy()
    print(f"学習（22区）: {len(train)}町丁目, incidents {train['incidents'].sum()}件")
    print(f"検証（荒川区）: {len(test)}町丁目, incidents {test['incidents'].sum()}件")

    # 区ダミー
    ward_dummies = pd.get_dummies(train["CITY_NAME"], prefix="ward", drop_first=True).astype(int)

    # 説明変数
    X = pd.concat(
        [train[["koban_n", "school_n", "conveni_n"]], ward_dummies],
        axis=1,
    )
    X = sm.add_constant(X)

    # offset = log(人口)
    offset = np.log(train["JINKO"])

    # ポアソン回帰
    model = sm.GLM(
        train["incidents"],
        X,
        family=sm.families.Poisson(),
        offset=offset,
    )
    result = model.fit()

    print()
    print("=== 係数・標準誤差・p値 ===")
    coef_table = pd.DataFrame({
        "coef": result.params,
        "std_err": result.bse,
        "z": result.tvalues,
        "p_value": result.pvalues,
    })
    print(coef_table.to_string())

    # 施設変数の符号チェック
    print()
    print("=== 施設変数の符号チェック ===")
    for var in ["koban_n", "school_n", "conveni_n"]:
        c = result.params[var]
        p = result.pvalues[var]
        sign = "正" if c > 0 else "負"
        note = ""
        if var == "koban_n" and c > 0:
            note = " ← 直感と逆（交番が多いほど危険）"
        if var == "school_n" and c > 0:
            note = " ← 直感と逆（学校が多いほど危険）"
        if var == "conveni_n" and c > 0:
            note = " ← 直感と逆（コンビニが多いほど危険）"
        print(f"{var:12s} coef={c:+.4f}  p={p:.4f}  ({sign}){note}")

    # モデル全体の情報
    print()
    print(f"対数尤度: {result.llf:.2f}")
    print(f"観測数: {result.nobs}")

    # 係数を保存
    coef_table.to_csv("processed/phase4_coefficients.csv")
    print()
    print("保存: processed/phase4_coefficients.csv")


if __name__ == "__main__":
    main()
