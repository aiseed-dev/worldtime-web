# WorldTimeStatic データ契約

build_data.py が生成する `data/*.json` のスキーマ定義。**実装より先にこのファイルを更新する**(eCitizenStatic と同運用)。

- 一次ソース: `/home/saki/dev/WorldTimeCore/WorldTimeCore/App_Data/`
- 文字コード: UTF-8、キーは snake_case
- 数値: lat/lng は float、フラグは int(元 TSV のまま)

## 1. data/locations.json — 都市マスター(516件)

元: `場所別時間帯.tsv`(26列)+ `dic場所別時間帯備考.json`(備考)+ `TWorld.tsv`(国名解決)

```json
[
  {
    "id": "Asia/Tokyo",            // 場所列。URL パス /WorldTime/Location/{id} に使用(2〜3セグメント)
    "name": "東京",                 // 名前
    "tz": "Asia/Tokyo",            // 時間帯列(IANA)。id と異なる場合あり(例: Asia/Bali → Asia/Makassar)
    "alpha2": "JP",
    "state": "",                   // 州(米国等)
    "country": "日本",              // TWorld.ShortName を Alpha2 で解決
    "wikipedia": "東京",            // Wikipedia 記事名(ja)。空あり
    "lat": 35.65,
    "lng": 139.74,
    "aiueo": "とうきよう",          // 50音ソートキー
    "area": "Asia",                // 11区分(Africa/Antarctica/Arctic/Asia/Atlantic/Australia/Europe/Indian/NorthAmerica/Pacific/SouthAmerica)
    "area_show": 1,                // area表示。>0 で Area ページに掲載、値は表示順
    "area_note": "",               // area備考(Area ページ「該当区域」列)
    "kunibetsu": 1,                // 国別表示。1..29=Country ページのゾーン代表行、100番台(<200)=追加都市
    "city_state": 0,               // 1=都市国家(タイトルが「{国名}の…」。Country/{a2} は Location へ 301)
    "genzone": "",                 // 現ゾーン。Country ページのゾーン分類先(空なら tz で分類)
    "wmo": "001/c00237",           // 気候データ(climate.json)のキー。空あり
    "icao": "RJTT",                // METAR 観測局(観測値==1 の行の観測値id)。空=現在の天気なし(385件が非空)
    "forecast": true,              // 天気予報の対象(旧 天気予報 が 1/2/3 の 112都市)
    "note": ""                     // dic場所別時間帯備考.json の HTML 断片。空あり
  }
]
```

- 除外しない(516件全件)。ページ生成側で表示フラグを解釈する。
- icao/forecast は Phase 4 で追加。天気データ自体は weather.time-j.net の `/data/world/` が配信する(スキーマは WeatherStatic 側 DATA_CONTRACT.md の world 節)。

## 2. data/timezones.json — タイムゾーン名称(430件)

元: `時間帯.tsv`(15列)。キー = Id(IANA tz)

```json
{
  "Asia/Tokyo": {
    "std": "JST",                  // StandardName(略称)。空あり
    "std_name": "日本標準時",       // タイムゾーン名
    "dst": "",                     // DstName(夏時間略称)
    "dst_name": "",                // 夏時間タイムゾーン名
    "has_dst": 0                   // 夏時間列(1=夏時間制度あり)
  }
}
```

## 3. data/countries.json — 国マスター(258件)

元: `TWorld.tsv` + `dic国別時間帯説明.json` + `dic国別時間帯備考.json` + `dic国別時間帯Tz備考.json`。キー = Alpha2

```json
{
  "JP": {
    "name": "日本",                 // ShortName
    "full_name": "日本国",          // FullName
    "name_e": "Japan",
    "capital": "東京",              // CapitalJ
    "aiueo": "にほん",
    "wikipedia": "日本",            // WikipediaJ
    "area_km2": 378000,            // Area(null あり)
    "popu": 127770000,             // Popu2007(null あり)
    "eu": 0,                       // 1=EU加盟国(Country/EU ページで使用)
    "tz_desc": "",                 // dic国別時間帯説明(HTML断片、複数tz国の解説)
    "tz_note": "",                 // dic国別時間帯備考
    "tz_tz_note": ""               // dic国別時間帯Tz備考
  }
}
```

- 為替(通貨iso等)・GDP は K3/スコープ外のため出力しない(必要になれば追加)。
- Phase 1 では name の解決のみに使用。Phase 2(Country ページ)で全項目を使う。

## 4. data/states.json — 州マスター(125件)

元: `TState.tsv`。キー = 州コード(TSV の主キー列)。Phase 2 で使用。構造は TSV 列をそのまま snake_case 化。

## 5. data/climate.json — 都市気候統計(339件)

元: `TClimatologicalInfo.json`。キー = Code(= locations.wmo)

```json
{
  "001/c00237": {
    "city_name": "Beijing",
    "institute": "China Meteorological Administration",
    "url": "http://www.cma.gov.cn/",
    "series": [
      {"name": "平均最高気温 °C", "data": [1.6, 4.0, ...]},   // 12ヶ月分。元 Info(JSON文字列)を展開
      {"name": "平均最低気温 °C", "data": [...]},
      {"name": "降水量 mm", "data": [...]}
    ]
  }
}
```

- 元データの `Info` はネストした JSON 文字列 → build 時にパースして展開する。
- 数値化できない値("-" 等)は null。

## 6. public/data/search.json — クライアント検索用(軽量版)

generate.py が locations.json から生成し public/ に配置(クライアントが fetch する唯一のデータ)。

```json
[
  ["東京", "とうきよう", "日本", "Asia/Tokyo"]   // [表示名, ふりがな, 国名, id(=URLパス断片)]
]
```

- 配列の配列(サイズ最小化)。516件で 30KB 程度を想定。

## 7. ページ焼き込み用インライン JSON(location ページ)

各 Location ページの `<script type="application/json" id="placeData">` に埋め込む:

```json
{
  "tz": "Asia/Tokyo",
  "name": "東京",
  "lat": 35.65, "lng": 139.74,
  "tzn": {"std": "JST", "std_name": "日本標準時", "dst": "", "dst_name": "", "has_dst": 0}
}
```

クライアント JS はこれと Temporal のみで動く(追加 fetch なし)。
