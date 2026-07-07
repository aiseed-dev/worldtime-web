# ビルド・デプロイ手順

## 前提

- Python 3.12 以降
- 一次データとして旧サイトのリポジトリ `/home/saki/dev/WorldTimeCore` の `WorldTimeCore/App_Data/` を参照します(パスは `timejlib/masters.py` の `APP_DATA` 定数)。マスター(都市・タイムゾーン・国の TSV、備考辞書 JSON、気候 JSON)を編集する場合も現状はそちらを編集します。
- 初回のみ仮想環境を作成:

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

## ビルド

```bash
./.venv/bin/python build_data.py   # 取得・変換層: App_Data → data/*.json
./.venv/bin/python generate.py     # 描画層: data/ + templates/ → public/
```

- `build_data.py` は件数と整合性チェック(未知のタイムゾーン・国コード等)を表示します。警告が出たら `timejlib/masters.py` の `TZ_ALIASES`(廃止 tz ID の正規化)や補正処理を確認してください。
- `generate.py` は `public/` を毎回作り直します(全削除→再生成)。ページ数・ファイル数が表示されます(2026-07 時点で約750ページ)。
- マスターだけ変えた場合も 2 コマンドとも実行してください(データ→描画の順)。

## ローカル確認

```bash
python3 -m http.server 5041 --directory public
# → http://localhost:5041/
```

- `public/_redirects` は Cloudflare Pages 専用のため、ローカルサーバーではリダイレクト(旧 URL・都市国家の Country ページ等)は動きません。
- 時計・変換・検索などは JavaScript(Temporal API)で動きます。Temporal 未対応ブラウザではポリフィル(`assets/vendor/temporal-polyfill.global.min.js`)が自動で読み込まれます。

## キャッシュバスティングの仕組み

`generate.py` が `assets/` の内容ハッシュ(md5 先頭8桁)をバージョン文字列として、HTML からの参照とJS モジュール間 `import` の両方に `?v=xxxxxxxx` を付与します。CSS/JS を変更してビルドすれば URL が変わるため、手動でのバージョン管理は不要です。

## デプロイ(Cloudflare Pages)

ビルドはローカルで行い、`public/` を wrangler で直接デプロイします(Git 連携は使いません)。

```bash
wrangler pages deploy public --project-name <プロジェクト名>
```

- デプロイ・DNS 切替などの外部公開操作は運用者自身が実行します。
- Cloudflare Pages の 1 デプロイあたりのファイル上限は 20,000(現状約770ファイルで余裕あり)。

## ディレクトリ構成

| パス | 役割 |
|---|---|
| `timejlib/masters.py` | 旧 App_Data の読込(TSV/JSON、tz ID 正規化、データ補正) |
| `build_data.py` | `data/*.json` の生成(スキーマは [DATA_CONTRACT.md](DATA_CONTRACT.md)) |
| `generate.py` | 全ページ生成、`_redirects`・検索/会議用 JSON・アセット配置 |
| `templates/` | Jinja2 テンプレート(`pages/` は静的記事の HTML 断片) |
| `assets/css`, `assets/js` | 自前 CSS / vanilla JS モジュール(Temporal API) |
| `assets/vendor/` | セルフホストする第三者ライブラリ(Temporal ポリフィル) |
| `data/`, `public/` | 生成物(Git 管理外) |

設計方針・決定事項は [DESIGN.md](DESIGN.md) を参照してください。

## 天気データ(Phase 4)

- Location ページの「現在の天気」(METAR)と「天気予報」(met.no)は、**WeatherStatic 側が生成する `weather.time-j.net/data/world/` の静的 JSON** をブラウザが直接 fetch します(assets/js/weather.js)。worldtime のビルドには天気データは不要です。
- 取得バッチは `/home/saki/dev/weather/WeatherStatic/fetch_world.py`(cron はそちらの運用)。スキーマは WeatherStatic の DATA_CONTRACT.md「world」節を参照。
- **ローカルで天気欄を確認する場合**: weather.js は localhost では同一オリジンの `/data/world/` を見るので、
  `cp -r ../weather/WeatherStatic/public/data/world public/data/world`
  で最新データをコピーしてください(public/ は再生成で消えるため、必要なときに都度コピー)。
