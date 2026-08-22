# Phase 1 — 環境構築

- 作成者: tada246
- 使用AIモデル: deepseek/deepseek-v4-pro-0813
- タイムスタンプ: 2026-08-22

## やったこと

`apps/data/.venv/` に仮想環境を作成し、分析に必要なライブラリを揃えた。

- `python3 -m venv --system-site-packages .venv`
  - 既存のユーザーサイト（pandas / geopandas / shapely / pyproj / pyogrio / numpy）を引き継ぐ
  - 不足分の `statsmodels` と `scipy` を `.venv` 内にインストール
- `.venv/` を `.gitignore` に追加（git管理外）

## 数字（import 確認結果）

| ライブラリ | バージョン | 状態 |
|-----------|-----------|------|
| pandas | 2.3.3 | OK |
| geopandas | 1.0.1 | OK |
| shapely | 2.0.7 | OK |
| pyproj | 3.6.1 | OK |
| statsmodels | 0.14.6 | OK（新規） |
| pyogrio | 0.11.1 | OK |
| numpy | 2.0.2 | OK |
| scipy | 1.13.1 | OK（新規） |

## 詰まった点と解決

- システムPython（3.9.6）のユーザーサイトに pandas/geopandas は既にあったが、statsmodels/scipy が無かった。
- システムを汚さないため venv を採用。`--system-site-packages` で既存パッケージを引き継ぎ、追加分だけ `.venv` に隔離した。

## 次フェーズへの申し送り

- 実行は必ず `.venv/bin/python` を使うこと（システムの `python3` ではない）
- Phase 2（事件データ → 町丁目に結合）へ進む
