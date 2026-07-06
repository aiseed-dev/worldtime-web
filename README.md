# WorldTimeStatic — 世界時計・世界の時間と時差(time-j.net)

世界の都市の現在時刻と時差を調べられるウェブサイト「世界時計 - 世界の時間と時差」([time-j.net](https://www.time-j.net/))のソースです。2010年公開の初代サイトから続く世界時計サービスを、C#/ASP.NET Core 版(WorldTimeCore)から **pure HTML/CSS/JavaScript の静的サイト**として作り直したものです。

## サイトの内容

- **世界の都市の現在時刻**(516都市): 都市ごとのページで、現在時刻・タイムゾーンの名称(日本語)・協定世界時/日本時間との時差・サマータイムの実施状況と次の切替日時を表示します。
- **時差の計算**: 現地時間と日本時間の双方向変換、24時間分の時差早見表(サマータイム切替後の表も自動表示)。
- **日の出・日の入り**: 都市の緯度経度から任意の日付の日の出・日の入り時刻を計算します(白夜・極夜にも対応)。
- **地域・国からの一覧**: 大陸/海洋別(11地域)の時刻一覧、国別ページ(約250カ国、アメリカ・ロシアなど複数タイムゾーン国はゾーン別に表示)、EU加盟国一覧、50音順の国一覧・都市一覧・都市検索。
- **ツール**: 海外との会議時間の計算(複数都市の時刻対応表)、世界の新年へのカウントダウンと初日の出の時間。
- **読み物**: タイムゾーンの仕組み、サマータイム、UTC/GMT/うるう秒、世界の国の数などの解説記事。
- **気候の平年値**: 都市ページに月別の平均気温・降水量を掲載しています。

## 特徴

- **サーバーレスの静的サイト**: 全ページが事前生成された HTML で、データベースもアプリケーションサーバーも使いません。ホスティングは Cloudflare Pages です。
- **時刻計算は Temporal API**: ES2026 で標準化された JavaScript の Temporal API を使い、時刻表示・サマータイム判定・タイムゾーン変換をすべてブラウザ内で行います。タイムゾーンデータはブラウザ内蔵の IANA tzdb を利用するため、tzdata の更新に自動で追随します。未対応ブラウザ(Safari 等)にはポリフィルを自動配信します。
- **軽量**: フレームワーク・jQuery 不使用の vanilla JS、自前 CSS(BIZ UD 系優先のシステムフォント)。外部 CDN には依存しません。
- **旧サイトと URL 互換**: `/WorldTime/Location/Asia/Tokyo` などの URL 構造を維持しています。

## 構成

| パス | 内容 |
|---|---|
| `build_data.py` / `timejlib/` | 取得・変換層: 旧サイトのマスター(都市・タイムゾーン・国・気候)を `data/*.json` に変換 |
| `generate.py` / `templates/` | 描画層: Jinja2 テンプレートから `public/` に全ページ(約750ページ)を生成 |
| `assets/js/` | クライアント層: Temporal API による時計・変換・日の出計算・検索(vanilla JS モジュール) |
| `docs/DESIGN.md` | 設計書(方針・決定事項ログ・フェーズ計画) |
| `docs/DATA_CONTRACT.md` | `data/*.json` のスキーマ定義 |
| `docs/BUILD.md` | ビルド・デプロイ手順 |
| `docs/MANUAL.md` | ユーザー向けマニュアル(サイトの使い方) |

`public/`(生成物)と `data/`(中間データ)はリポジトリに含みません。

## 関連プロジェクト

- 姉妹サイト: [気温と雨量の統計](http://weather.time-j.net/)(weather.time-j.net)
- スマホアプリ版 worldtime(Flutter)は別リポジトリです。

## ライセンス

Copyright (C) 2026 aiseed.dev

本リポジトリのコードは [GNU Affero General Public License v3.0](LICENSE)(AGPL-3.0)で公開しています。

- `assets/vendor/temporal-polyfill.global.min.js` は [temporal-polyfill](https://github.com/fullcalendar/temporal-polyfill)(MIT License)のビルド済みファイルです。
- 記事中の一部画像は Wikimedia Commons 由来(CC BY-SA 3.0、各ページにクレジット表記)です。

## 運営

オープンデータビジネス研究会
