# WorldTimeStatic 設計書

WorldTimeCore(time-j.net、世界時計サイト)を pure HTML/CSS/JavaScript の静的サイトへ移行する。
時刻計算はブラウザ標準の **Temporal API** で行う。

- 作成日: 2026-07-06
- 状態: **ドラフト(承認待ち)** — §10 の未決事項を確認のこと
- 前例: WeatherCore→WeatherStatic、eCitizen→eCitizenStatic の二層分離パターンを踏襲

---

## 1. 背景と目的

- 現行 WorldTimeCore は ASP.NET Core 2.1(EOL)+ PostgreSQL 2DB(timej2/metar)+ NodaTime で稼働。
- サーバーサイドの時刻計算・DB・キャッシュ層を廃し、静的ファイル + クライアント JS に置き換える。
- 世界時計という性質上、**時刻表示は本質的にクライアント側の仕事**であり、静的化と相性がよい。
  現行もハイブリッド(サーバーで DST 境界を計算しキャッシュ → JS が Unix 時刻で表示)だが、
  Temporal API の標準化(ES2026)により全計算をクライアントで完結できるようになった。
- スマホアプリ worldtime(Flutter)とは別プロダクト。本サイトの静的 JSON はアプリのデータソースとしても利用可能な形式にする(eCitizen/Statdb と同じ発想)。

## 2. 現行サイト調査サマリ

調査詳細は元コード参照(パスは §12)。規模感:

| 項目 | 数量 |
|---|---|
| 都市(場所別時間帯.tsv) | 516 |
| タイムゾーン定義(時間帯.tsv) | 430(標準時/夏時間の日本語名・略称) |
| 国(TWorld.tsv) | 258 |
| 州(TState.tsv) | 125 |
| ブログ記事 | blogindex.json に 325 件(→ K4 で廃止決定のため移行対象外) |
| 気象統計(TClimatologicalInfo.json) | 321KB、都市別月平均気温・降水量等 |

主要機能と静的化方針:

| 機能 | 現行実装 | 静的化方針 |
|---|---|---|
| 現在時刻表示(Home/Area/Location) | NodaTime + DST境界キャッシュ + JS | **Temporal でクライアント完結**(§4) |
| 会議時間計算(Meeting) | NodaTime サーバー計算 | Temporal でクライアント完結 |
| 日の出日の入(SunCalculator) | 天文アルゴリズム C# | JS 移植(NOAA 式)、クライアント計算 |
| サマータイム情報(Uc/Dst) | NodaTime | Temporal で DST 境界をクライアント探索 |
| カウントダウン(NewYear 等) | サーバー計算 | Temporal でクライアント完結 |
| 都市・国・地域ページ | Razor + TSV マスター | Jinja2 でビルド時生成 |
| ブログ(/wp) | JSON インデックス + HTML 断片 | **廃止(K4)**。今後の発信は Facebook で対応。/Uc/ の記事は維持 |
| 検索(Search) | サーバー検索 | クライアント検索(全都市 JSON は数十KB で足りる) |
| 天気予報(yr.no/Met) | サーバー fetch + ファイルキャッシュ | **保留 — 後で詳細検討(K3)**。Phase 1 では非搭載 |
| METAR/TAF(航空気象) | PostgreSQL metar DB + 定時取込 | **保留 — 天気予報とあわせて後で検討(K3)** |
| 為替レート | PostgreSQL timej2 DB | **保留 — 後で検討(K3)** |
| お問い合わせフォーム | Google Cloud Datastore + メール | **廃止(410)(K1)** |
| Web ウィジェット(/Wg) | サーバー生成 JS | **廃止(K2)** |
| WorldTimeAdmin(TSV 編集) | 別 ASP.NET アプリ | 廃止。TSV はリポジトリで直接管理 |
| モバイル UA 判定(.iPhone ビュー) | サーバー UA 判定で別ビュー | 廃止。レスポンシブ 1 本化 |

## 3. アーキテクチャ

WeatherStatic / eCitizenStatic と同じ二層分離 + クライアント層:

```
[取得・変換層] build_data.py
    App_Data/*.tsv, *.json(現行リポジトリから読込)
      → data/*.json(スキーマは DATA_CONTRACT.md で管理)

[描画層] generate.py + Jinja2
    data/*.json + templates/
      → public/(全ページの静的 HTML + 公開 JSON)

[クライアント層] assets/js/(vanilla JS + Temporal API)
    時刻表示・DST・会議計算・日の出日の入・検索・カウントダウン
```

- 言語: Python 3(生成系)+ vanilla JS(クライアント)。フレームワーク不使用。
- CSS: Bootstrap / jQuery / bower 全廃。自前 CSS Grid/Flexbox(eCitizen K1 と同方針)。
- データ処理は必ずローカル(eCitizen で確立した原則)。ビルドはローカル、デプロイは wrangler / cf-publish。
- ホスティング: **Cloudflare Pages** を提案(eCitizen K7 と統一。未決 D7)。
- ファイル数見積り: 都市 516 + 国 ~250 + 地域 ~10 + ブログ ~330 + その他 ≒ **1,200 ページ前後**。Pages の 20,000 上限に対し余裕十分。

## 4. Temporal API 実装方針

### 4.1 ブラウザ対応状況(2026-07 時点)

- **Stage 4 / ES2026 確定**(2026-03-11)
- ネイティブ対応: Chrome 144+(2026-01)、Edge 144+、Firefox 139+(2025-05)
- 未対応: **Safari**(Technology Preview のみ)→ iPhone ユーザーが多い世界時計サイトでは **ポリフィル必須**

### 4.2 ポリフィル戦略

```html
<script type="module">
  if (typeof Temporal === "undefined") {
    await import("/assets/js/temporal-polyfill.js"); // @js-temporal/polyfill をセルフホスト
    globalThis.Temporal = polyfill.Temporal;
  }
  // 以降のアプリコードは Temporal 前提で書く
</script>
```

- ポリフィルは **`temporal-polyfill`(fullcalendar 製)v0.3.0** をセルフホスト(`assets/vendor/temporal-polyfill.global.min.js`、56KB)。当初案の @js-temporal/polyfill(200KB超)より大幅に軽量で、`getTimeZoneTransition` 含め仕様準拠を確認済み(実装時に変更)。外部 CDN 不使用(eCitizen と同方針)。
- ネイティブ対応ブラウザはポリフィルを一切ダウンロードしない(動的 import)。
- Safari がネイティブ対応した時点で自然にポリフィル配信が消滅する構造。

### 4.3 時刻計算の対応表(NodaTime → Temporal)

| 現行(NodaTime/C#) | 移行後(Temporal/JS) |
|---|---|
| `tzdb.nzd` 同梱 + `TzdbDateTimeZoneSource` | **不要**。ブラウザ内蔵の IANA tzdb を使用(`Temporal.ZonedDateTime`) |
| `ZonedDateTime(instant, zone)` | `Temporal.Now.zonedDateTimeISO(tzId)` |
| `IsDaylightSavingTime()` | 1月/7月のオフセット比較で DST 有無を判定し、現在オフセットと照合 |
| DST 境界キャッシュ(CacheData) | 不要。`zonedDateTime.getTimeZoneTransition("next")` で次の切替日時を直接取得 |
| 会議時間計算(Meeting.cs) | `Temporal.PlainDateTime` + `withTimeZone` 相当の変換で複数都市の対応表を生成 |
| タイムゾーン名(JST 等) | 時間帯.tsv 由来のマスター JSON(日本語名・略称)。フォールバックは `Intl.DateTimeFormat` の `timeZoneName` |
| 日の出日の入(SunCalculator.cs) | NOAA 天文アルゴリズムを JS へ移植。日付・座標から計算し Temporal で当該ゾーンの時刻に変換 |

注意点:

- ブラウザ内蔵 tzdb は OS/ブラウザ更新で自動追随する(現行のように tzdb を自前更新する運用が不要になる)。
  反面、古い端末では tzdb が古い可能性がある。ポリフィルは自前 tzdb を持つため、この点でも Safari フォールバックと整合。
- 秒針更新は `setInterval` 1 秒ではなく、`requestAnimationFrame` +秒境界合わせで表示ズレを防ぐ。
- タイムゾーン ID は IANA 形式(`Asia/Tokyo`)をそのまま URL・データキーに使う(現行の 場所 列と一致)。

### 4.4 ページの初期表示

静的 HTML に時刻は焼き込めないため:

- HTML には都市名・国・座標・UTC オフセット(標準時)等の**不変情報のみ**を焼き込む(SEO 対象もここ)。
- 時刻セルは skeleton(`--:--`)で出力し、JS 起動後に Temporal で即時描画。
- `<noscript>` には標準時オフセットと「時刻表示には JavaScript が必要」の注記。

## 5. データ契約(概要 — 詳細は DATA_CONTRACT.md へ)

`data/` に生成する主要 JSON(すべて build_data.py が現行 App_Data から変換):

| ファイル | 元データ | 用途 |
|---|---|---|
| `locations.json` | 場所別時間帯.tsv | 全 516 都市(id, 名前, tz, alpha2, state, lat/lng, area, 表示フラグ, ふりがな) |
| `timezones.json` | 時間帯.tsv | tz ごとの日本語名・略称(標準時/夏時間) |
| `countries.json` | TWorld.tsv + dic国別時間帯*.json | 国マスター + 国別タイムゾーン説明・備考 |
| `areas.json` | TArea.tsv | 大陸・地域マスター |
| `states.json` | TState.tsv | 州マスター |
| `climate/{id}.json` または一体化 | TClimatologicalInfo.json | 都市別気象統計(ページ焼き込みか JSON 配信かは実装時判断) |

クライアントへは検索用の軽量版 `public/data/locations.json`(名前・ふりがな・tz・URL のみ)を配信。

## 6. URL 設計

現行 URL をそのまま維持する(SEO 資産保護)。ディレクトリ + `index.html` 形式で生成:

| 現行 | 静的サイト |
|---|---|
| `/` | `/index.html` |
| `/WorldTime/Area/{area}` | `/WorldTime/Area/{area}/index.html` |
| `/WorldTime/Location/{region}/{loc1}(/{loc2})` | 同構造で生成 |
| `/WorldTime/Country/...` | 同構造で生成 |
| `/Search` | `/Search/index.html`(クライアント検索) |
| `/wp`, `/wp/*` | 410(K4。ブログ廃止、発信は Facebook へ) |
| `/Uc/*` | 同構造で生成(K4 により記事コンテンツとして維持) |
| `/Region/{area}` 等の旧互換 | `_redirects` で 301 |
| `/Contacts` | 410(K1) |
| `/Wg/*`, `/Uc/WebWidget` | 410(K2。ウィジェット廃止) |

## 7. ページ構成と生成規模

| 種別 | ページ数(概算) | 内容 |
|---|---|---|
| Home | 1 | 主要都市の時計一覧(現行同等) |
| Area | ~10 | 大陸別都市時計一覧 |
| Location | 516 | 都市詳細: 時計、タイムゾーン情報、DST 期間、日の出日の入、気象統計(平年値)。天気予報・METAR・為替欄は K3 の検討結果が出るまで非搭載 |
| Country | ~250 | 国別: 首都時刻、複数 tz 国は tz 一覧 + 説明 |
| LocationIndex / Search | 2 | 全都市索引(50音・地域別)+ 検索 |
| Uc 系ツール・記事 | ~7 | Dst、NewYear カウントダウン、GMT/UTC 解説、World-Countries 等(K4 で維持決定) |
| Meeting | 1 | 会議時間計算(クライアント完結の対話ツール) |
| 静的ページ | ~5 | About、PrivacyPolicy、Careers 等 |
| **合計** | **~800** | (ブログ廃止 K4 により約330ページ減) |

## 8. フェーズ計画

- **Phase 0: 基盤** — リポジトリ雛形、build_data.py(TSV→JSON)、ベースレイアウト/CSS、Temporal ラッパー(`timej.js`)+ポリフィル読込、ローカルプレビュー
- **Phase 1: コア世界時計(パイロット)** — Home + Area + Location(516)+ LocationIndex + クライアント検索。時計・DST 表示・日の出日の入まで。**ここで品質・方式を確認してから先へ進む**
- **Phase 2: ツール群・記事** — Meeting(会議時間計算)、Uc 一式(Dst、NewYear カウントダウン、GMT/UTC、World-Countries 等)、Country ページ
- **Phase 3: (消滅)** — ブログは K4 で廃止決定(/wp/* は 410、発信は Facebook)
- **Phase 4: 動的データ系** — 天気予報・METAR・為替。**weather.time-j.net 側の API 設計が決まってから検討(K3-2)**。それまで凍結
- **Phase 5: 仕上げ** — `_redirects`、410 設定、sitemap.xml、404、GA4、OGP、本番切替(DNS)

各フェーズ完了時に承認を得てから次へ(eCitizen と同運用)。

## 9. 廃止するもの

- ASP.NET Core / PostgreSQL 2DB / NodaTime / tzdb.nzd・zoneinfo 同梱
- WorldTimeAdmin(TSV 編集 UI)→ マスター TSV は Git 管理・直接編集
- Bootstrap 3 / jQuery / bower / bundleconfig
- モバイル UA 判定と `.iPhone` 別ビュー → レスポンシブ 1 本化
- IP 制限ミドルウェア、Google Cloud Datastore 連携
- サーバーサイドの DST 境界キャッシュ(CacheData)
- お問い合わせフォーム(K1、410)
- Web ウィジェット /Wg・/Uc/WebWidget(K2、410)
- ブログ /wp 一式(K4、410。今後の発信は Facebook。/Uc/ の記事は維持)

## 10. 未決事項(要決定)

| # | 論点 | 状態 |
|---|---|---|
| **D2+D3+D4** | 天気予報・METAR/TAF・為替レート | **保留(K3)**。Phase 4 着手前に別途詳細検討する。検討材料は §11 K3 の注記参照 |
| **D10** | AdSense 広告の配置 | 新テンプレートのどの位置に何ユニット置くか。Phase 1 のテンプレート実装時に決定(旧サイトは 15 スロットを各ページに配置していた) |

(D1・D5〜D9 は決定済み → §11 へ移動)

## 11. 決定事項ログ

| # | 日付 | 決定 |
|---|---|---|
| **K1** | 2026-07-06 | お問い合わせフォームは**廃止**(410)。eCitizen 前例に同じ |
| **K2** | 2026-07-06 | Web ウィジェット(/Wg、/Uc/WebWidget)は**廃止**(410) |
| **K3** | 2026-07-06 | 天気予報・METAR/TAF・為替レートは**後で詳しく検討**(保留)。Phase 1-2 はこれらなしで進められる構成とし、Location ページは検討結果が出てから欄を追加できるテンプレート構造にしておく。検討時の材料: Open-Meteo(CORS・キー不要)、yr.no ToS の User-Agent 制約、aviationweather.gov API の CORS 可否、ローカルバッチ+データのみデプロイ方式、metar DB の資産(空港マスター等) |
| **K3-2** | 2026-07-07 | Phase 4(天気予報・METAR/TAF)は **weather.time-j.net(Weather/WeatherStatic)側でどういう API(静的 JSON 等)を提供するかを決めてから、それに合わせて検討する**(ユーザー方針)。worldtime 側から気象 API を直接叩くのではなく、weather 側が配信するデータを利用する構想。Weather 側の API 設計時に worldtime の必要データ(都市別予報・METAR)を要件として持ち込むこと |
| **K4** | 2026-07-06 | ブログ(/wp 一式)は**廃止**(410)。今後の発信は **Facebook** で対応。ただし **/Uc/ ディレクトリの記事(Dst、GMT/UTC 解説等)は必要なので維持**し、静的生成の対象とする |
| **K5** | 2026-07-06 | ホスティングは **Cloudflare Pages**(eCitizen と統一)。ビルドはローカル、wrangler pages deploy。time-j.net の DNS 切替はユーザー作業 |
| **K6** | 2026-07-06 | フォントは **BIZ UD 系優先のシステムフォントスタック**(webフォントのセルフホストはしない)。例: `"BIZ UDPGothic", "BIZ UDGothic", "Hiragino Sans", "Noto Sans CJK JP", sans-serif`。Windows 10+ は BIZ UD 内蔵、他 OS は各システムフォントへフォールバック |
| **K7** | 2026-07-06 | Google Analytics は **GA4 測定 ID `G-NDMMVEGBQ4`**(ストリーム: www.time-j.net、ストリーム ID 5829281162)+ gtag.js を全ページ共通レイアウトに設置。旧 `UA-16580464-1`(analytics.js)は廃止 |
| **K8** | 2026-07-06 | Google AdSense は現行と同じ **`ca-pub-1546885182692889`** を継続使用。広告ユニットはレスポンシブ形式で作り直し、配置は Phase 1 テンプレート実装時に決定(D10)。旧サイトの 15 スロット ID は流用せず参考扱い |
| **K9** | 2026-07-06 | **自動広告(Auto ads)は不使用。手動配置ユニットのみ**。自動広告の方が収益は大きい(実績: 自動 ¥40,460 vs 手動 ¥15,110)が、レイアウトへの割込みがひどく UX を損なうため、**減収を容認して手動配置を選択**(ユーザー判断)。実装時の注意: コードスニペット自体は共通のため、AdSense 管理画面側で time-j.net の自動広告をオフにする必要がある(ユーザー作業) |
| **K10** | 2026-07-06 | 広告方針の方向性: **広告収益には依存しない。広告枠は自社サービスへの誘導(スマホアプリ worldtime、ecitizen.jp 等)に使う方が良い**(ユーザー発言)。D10 の配置検討では AdSense ユニットより自社誘導枠(アプリ紹介バナー等)を優先する |

## 12. 実装記録

### Phase 0+1 完了(2026-07-06)

- 構成: `build_data.py`(旧 App_Data → data/*.json)、`generate.py` + Jinja2(→ public/、532ページ・541ファイル)、`timejlib/`(Python 読込層)、`assets/js/`(vanilla JS モジュール)。Python は `./.venv`(Jinja2 + tzdata)。
- 生成ページ: Home、Area×11、Location×516、LocationIndex、Search、About、PrivacyPolicy。
- クライアント JS: `timej.js`(Temporal ブート+ゾーン計算共通)、`clock.js`(毎秒更新、`data-tz` 属性ベース)、`location.js`(タイムゾーン情報・DST情報・双方向変換・時差早見表・日の出日の入)、`sun.js`(NOAA 天文計算)、`search.js`(かな正規化つきクライアント検索)。
- 検証済み: NY(EDT・次回切替 2026-11-01 01:00 EST・日の出 5:31/日の入 20:30)、デリー(UTC+5:30・JST-3:30・30分単位早見表)、ブエノスアイレス(3セグメント URL・南半球冬の日照)、オークランド(日付跨ぎ)、DST マーク表示、検索(ぱり/フランス/new_york)、モバイル 375px 表示。コンソールエラーなし。
- 旧 tz ID の正規化(build 時): Asia/Chongqing→Asia/Shanghai、America/Godthab→America/Nuuk、Europe/Kiev→Europe/Kyiv(場所 ID・URL は不変)。

### Phase 2 完了(2026-07-07)

- 追加ページ: **Country×209**(単一/複数タイムゾーン国を1テンプレートで対応、説明/備考/TZ備考辞書を表示)、**Country/EU**(加盟27カ国一覧)、**ListOfCountries**(252カ国・50音別)、**カウントダウン ニューイヤー**(/WorldTime/Home/NewYear、年は自動更新のエバーグリーン化)、**会議時間計算**(/WorldTime/Meeting、新規ツール — 旧 Meeting.cs は現行サイトでルート未接続の死蔵コードだったため新設計)、**Uc 記事×7**(Index/Dst/GmtUtc/NewYear/News/WorldCountries/Link を Razor 除去で自動変換移植)。総ページ 752・総ファイル 768。
- `public/_redirects` 生成開始: citystate 41カ国(Country/{a2}→Location)、旧特殊コード AC/AN/DG/EA/IC/TA、/WorldTime/{US,CA,AU,BR,MX,RU,EU,AQ} ショートカット、/Region/* → /WorldTime/Area/*。
- データ補正: TWorld.tsv の GB の EU フラグを離脱済みとして無効化(ビルド時補正)。locations に genzone(現ゾーン)、countries に eu を追加(DATA_CONTRACT 更新済み)。
- バグ修正: sun.js の日の出計算が UTC 暦日基準のため UTC+14 圏(キリバス等)で1日ずれる問題(現地日付一致で暦日を探索する方式に修正)。アセットの キャッシュ更新は内容ハッシュ版数(`?v={md5}`)をページ参照とモジュール間 import の両方に付与して解決。
- 検証済み: US(7ゾーン・都市グルーピング・フェニックス/ハワイの夏時間なし判定)、RU(11ゾーン)、EU(27カ国)、会議表(東京0:00=NY前日11:00=ロンドン前日16:00)、ニューイヤー(キリスィマスィ島が最先行・初日の出カウント正常)、Uc記事表示・画像。コンソールエラーなし。

### 旧サイトからの意図的な逸脱

1. Area ページの現在時刻は自動更新に変更(旧は「再読込してください」の静的表示)。
2. Home のクリッカブル世界地図(image map)は廃止し、地域リンクグリッド+主要都市の生時計グリッドに置換(レスポンシブ非対応のため)。
3. Location ページの天気予報・METAR・為替・空港情報欄は K3 決定まで非搭載。アナログ時計(CoolClock)は廃止。
4. About/PrivacyPolicy からお問い合わせフォームへの参照を削除(K1)。About の古い更新履歴・サービス追加予定の節は削除。
5. 都市一覧(LocationIndex)は「地域別 × 50音順」の単純構成に変更。
6. meta description に現在時刻を含めない(静的化のため不可能)。
7. US/CA/AU/BR/MX/RU/AQ の国別特製ビュー(州別グルーピング・地図等)は汎用の複数ゾーンテンプレートに統合(Phase 2)。
8. 会議時間計算(/WorldTime/Meeting)は旧サイトに無い新規ツール(旧 Meeting.cs は未使用コードだった)。
9. カウントダウン ニューイヤーは年を JS で自動判定するエバーグリーンページに変更(旧は毎年手動更新)。
10. ListOfCountries のモバイル用50音ページ分割(/WorldTime/ListOfCountries/x{n})は廃止し、レスポンシブな1ページに統合。

## 13. 参照(現行コード)

- ルーティング: `WorldTimeCore/Startup.cs`
- 初期化・マスター読込: `WorldTimeCore/Models/AppIni.cs`
- 時刻計算: `Models/NodaTimeUtils.cs`, `Models/TzDatabase/WorldTimeUtils.cs`(CacheData)
- 会議計算: `Models/TzDatabase/Meeting.cs` / 日の出日の入: `Models/TzDatabase/SunCalculator.cs`
- 天気: `Models/TzDatabase/Weather.cs` / METAR: `Controllers/MetarAppController.cs`, `MetarApiController.cs`
- マスター: `App_Data/場所別時間帯.tsv`(516 都市・26 列)、`時間帯.tsv`(430 tz・15 列)、`TWorld.tsv`、`TArea.tsv`、`TState.tsv`
- 補足辞書: `App_Data/dic国別時間帯説明.json` ほか 3 種
- ブログ: `App_Data/blogindex.json`, `categories.json`, `dateArchives.json`, `html/blog/`
- 管理ツール: `WorldTimeAdmin/`(廃止対象)
- スマホアプリ: `/home/saki/dev/worldtime`(Flutter。本移行のスコープ外)
