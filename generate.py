#!/usr/bin/env python3
"""描画層: data/*.json + templates/ → public/

usage: python3 generate.py
"""
import hashlib
import json
import re
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).parent
DATA = ROOT / "data"
PUBLIC = ROOT / "public"
OLD_WWWROOT = Path("/home/saki/dev/WorldTimeCore/WorldTimeCore/wwwroot")

def _asset_ver():
    """assets/ の内容ハッシュ(短縮)。変更時に URL が変わりキャッシュが切れる"""
    h = hashlib.md5()
    for p in sorted((Path(__file__).parent / "assets").rglob("*")):
        if p.is_file():
            h.update(p.read_bytes())
    return h.hexdigest()[:8]


ASSET_VER = _asset_ver()
SITE = "Time-j.net"

AREA_ORDER = [
    ("Asia", "アジア"),
    ("Europe", "ヨーロッパ"),
    ("Africa", "アフリカ"),
    ("NorthAmerica", "北アメリカ"),
    ("SouthAmerica", "南アメリカ"),
    ("Australia", "オーストラリア"),
    ("Pacific", "太平洋"),
    ("Atlantic", "大西洋"),
    ("Indian", "インド洋"),
    ("Antarctica", "南極"),
    ("Arctic", "北極"),
]
AREA_NAMES = dict(AREA_ORDER)

# ホーム「主要都市の現在時刻」(K10: 自社導線よりまず利便性)
FEATURED_IDS = [
    "Asia/Tokyo", "Asia/Seoul", "Asia/Shanghai", "Asia/Singapore",
    "Asia/Bangkok", "Asia/Dubai", "Europe/London", "Europe/Paris",
    "Europe/Berlin", "America/New_York", "America/Los_Angeles",
    "Pacific/Honolulu", "Australia/Sydney", "Pacific/Auckland",
    "America/Sao_Paulo", "Europe/Moscow",
]

# ホーム「人気海外旅行先」(旧サイトのまま)
POPULAR = [
    ("ビーチリゾート", ["Pacific/Honolulu", "Pacific/Guam", "Pacific/Saipan",
                        "Asia/Phuket", "Asia/Bali", "Asia/Cebu",
                        "Indian/Maldives", "Australia/Cairns"]),
    ("アジア", ["Asia/Seoul", "Asia/Taipei", "Asia/Bangkok", "Asia/Hong_Kong",
                "Asia/Shanghai", "Asia/Beijing", "Asia/Macau", "Asia/Ho_Chi_Minh",
                "Asia/Singapore", "Asia/Kuala_Lumpur", "Asia/Dubai"]),
    ("ヨーロッパ", ["Europe/Paris", "Europe/Nice", "Europe/London", "Europe/Rome",
                    "Europe/Florence", "Europe/Geneva", "Europe/Barcelona",
                    "Europe/Frankfurt", "Europe/Vienna", "Europe/Prague"]),
    ("北アメリカ", ["America/Los_Angeles", "America/San_Francisco", "America/Las_Vegas",
                    "America/New_York", "America/Miami", "America/Toronto",
                    "America/Cancun"]),
    ("その他", ["Australia/Sydney", "Australia/Alice_Springs", "Pacific/Auckland",
                "Pacific/Christchurch", "America/Rio_de_Janeiro", "America/Lima",
                "Europe/Istanbul"]),
]

# 旧 /WorldTime/{id} ショートカットと特殊リダイレクト(_redirects へ)
COUNTRY_SHORTCUTS = ["US", "CA", "AU", "BR", "MX", "RU", "EU", "AQ"]
SPECIAL_COUNTRY_REDIRECTS = {
    "AC": "Atlantic/Ascension",
    "AN": "America/Curacao",
    "DG": "Indian/Chagos",
    "EA": "Africa/Ceuta",
    "IC": "Atlantic/Canary",
    "TA": "Atlantic/Tristan_da_Cunha",
}

# カウントダウン ニューイヤーの都市(地域ごと、新年の早い順を意識)
NEWYEAR_AREAS = [
    ("オセアニア・太平洋", ["Pacific/Kiritimati", "Pacific/Apia", "Pacific/Chatham",
                            "Pacific/Tongatapu", "Pacific/Auckland", "Pacific/Fiji",
                            "Australia/Sydney", "Pacific/Guam", "Pacific/Honolulu",
                            "Pacific/Pago_Pago"]),
    ("アジア", ["Asia/Tokyo", "Asia/Seoul", "Asia/Shanghai", "Asia/Hong_Kong",
                "Asia/Taipei", "Asia/Singapore", "Asia/Bangkok", "Asia/Jakarta",
                "Asia/Delhi", "Asia/Dubai"]),
    ("ヨーロッパ・アフリカ", ["Europe/Moscow", "Europe/Istanbul", "Europe/Athens",
                              "Europe/Berlin", "Europe/Paris", "Europe/London",
                              "Africa/Cairo", "Africa/Johannesburg"]),
    ("南北アメリカ", ["America/Sao_Paulo", "America/Argentina/Buenos_Aires",
                      "America/New_York", "America/Chicago", "America/Denver",
                      "America/Los_Angeles", "America/Anchorage"]),
]

# Uc 記事(テンプレート名, URLパス, タイトル)
UC_PAGES = [
    ("Index", "Uc", "世界の時間とタイムゾーンについて"),
    ("Dst", "Uc/Dst", "サマータイムについて"),
    ("GmtUtc", "Uc/GmtUtc", "UTC, GMT, うるう秒について"),
    ("NewYear", "Uc/NewYear", "世界で一番早い「新年」、「初日の出」の場所"),
    ("News", "Uc/News", "タイムゾーンに関するニュースから"),
    ("WorldCountries", "Uc/WorldCountries", "世界の国の数"),
    ("Link", "Uc/Link", "タイムゾーンに関する関係リンクについて"),
]

AIUEO_ROWS = [
    ("あ行", "あいうえお"), ("か行", "かきくけこ"), ("さ行", "さしすせそ"),
    ("た行", "たちつてと"), ("な行", "なにぬねの"), ("は行", "はひふへほ"),
    ("ま行", "まみむめも"), ("や行", "やゆよ"), ("ら行", "らりるれろ"),
    ("わ行", "わをん"),
]

# ホーム「世界の都市の一覧」抜粋(旧サイトのまま、4列)
CITY_COLS = [
    ["America/New_York", "America/Los_Angeles", "America/Montreal",
     "America/Mexico_City", "Europe/Madrid"],
    ["Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Rome",
     "Europe/Istanbul"],
    ["Europe/Moscow", "Africa/Johannesburg", "Australia/Sydney",
     "America/Sao_Paulo", "America/Argentina/Buenos_Aires"],
    ["Asia/Shanghai", "Asia/Seoul", "Asia/Delhi", "Asia/Jakarta", "Asia/Riyadh"],
]


def load(name):
    with open(DATA / name, encoding="utf-8") as f:
        return json.load(f)


def offset_label(td):
    """timedelta → '+9' '-3:30' '±0'"""
    mins = int(td.total_seconds()) // 60
    if mins == 0:
        return "±0"
    sign = "-" if mins < 0 else "+"
    h, m = divmod(abs(mins), 60)
    return f"{sign}{h}" + (f":{m:02d}" if m else "")


def std_offset(tz):
    """標準時(1月/7月の小さい方)の UTC オフセット"""
    z = ZoneInfo(tz)
    y = datetime.now().year
    jan = datetime(y, 1, 15, tzinfo=z).utcoffset()
    jul = datetime(y, 7, 15, tzinfo=z).utcoffset()
    return min(jan, jul)


def wikipedia_link(s):
    """旧 WikipediaLink 相当: [[記事名|表示]] 形式から記事名を取り出す"""
    i = s.find("[[")
    if i >= 0:
        ends = [e for e in (s.find("]]"), s.find("|")) if e > 0]
        if not ends:
            return ""
        s = s[i + 2:min(ends)]
    return s.replace(" ", "_")


def out(path, html):
    p = PUBLIC / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(html, encoding="utf-8")


def main():
    locations = load("locations.json")
    timezones = load("timezones.json")
    climate = load("climate.json")
    countries = load("countries.json")
    by_id = {l["id"]: l for l in locations}

    env = Environment(
        loader=FileSystemLoader(ROOT / "templates"),
        autoescape=select_autoescape(["html", "j2"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )

    def render(template, path, **ctx):
        ctx.setdefault("asset_ver", ASSET_VER)
        out(path, env.get_template(template).render(**ctx))

    if PUBLIC.exists():
        shutil.rmtree(PUBLIC)

    n_pages = 0

    # ---- Location(都市)ページ ----
    for loc in locations:
        tzn = timezones.get(loc["tz"]) or {
            "std": "", "std_name": "", "dst": "", "dst_name": "", "has_dst": 0}
        so = offset_label(std_offset(loc["tz"]))
        if loc["city_state"] == 1:
            title_base = f'{loc["country"]}の時差と現在時刻'
            crumb_tail = [{"label": loc["country"], "url": None}]
        else:
            title_base = f'{loc["country"]} / {loc["name"]}の時差と現在時刻'
            crumb_tail = [
                {"label": loc["country"], "url": f'/WorldTime/Country/{loc["alpha2"]}'},
                {"label": loc["name"], "url": None},
            ]
        breadcrumb = [
            {"label": "世界時計", "url": "/"},
            {"label": AREA_NAMES.get(loc["area"], loc["area"]),
             "url": f'/WorldTime/Area/{loc["area"]}'},
        ] + crumb_tail
        place_json = json.dumps({
            "tz": loc["tz"], "name": loc["name"],
            "lat": loc["lat"], "lng": loc["lng"],
            "tzn": tzn,
        }, ensure_ascii=False, separators=(",", ":"))
        render(
            "location.html.j2",
            f'WorldTime/Location/{loc["id"]}/index.html',
            title=f"{title_base} - {SITE}",
            header=title_base,
            description=(
                f'{loc["name"]}({loc["country"]})の現在時刻・日本との時差・'
                "サマータイム情報・日の出日の入りの時間。"
                "現地時間と日本時間の変換計算もできます。"),
            breadcrumb=breadcrumb,
            place=loc,
            place_json=place_json,
            tz_static_label=(tzn["std"] + " " + tzn["std_name"]).strip(),
            std_offset_label=so,
            climate=climate.get(loc["wmo"]) if loc["wmo"] else None,
        )
        n_pages += 1

    # ---- Area(地域)ページ ----
    for area_id, area_name in AREA_ORDER:
        rows = []
        for loc in locations:
            if loc["area"] != area_id or loc["area_show"] <= 0:
                continue
            tzn = timezones.get(loc["tz"]) or {}
            rows.append({
                "id": loc["id"], "name": loc["name"], "tz": loc["tz"],
                "alpha2": loc["alpha2"], "country": loc["country"],
                "area_note": loc["area_note"],
                "std": tzn.get("std", ""), "dst": tzn.get("dst", ""),
                "has_dst": tzn.get("has_dst", 0),
                "_aiueo": countries.get(loc["alpha2"], {}).get("aiueo", ""),
                "_ord": loc["area_show"],
            })
        rows.sort(key=lambda r: (r["_aiueo"], r["_ord"]))
        title = f"{area_name}の現在時刻と時差一覧"
        render(
            "area.html.j2",
            f"WorldTime/Area/{area_id}/index.html",
            title=f"{title} - {SITE}",
            header=title,
            description=f"{area_name}の国と地域の現在時刻・UTCとの時差・サマータイム実施状況の一覧。",
            breadcrumb=[{"label": "世界時計", "url": "/"},
                        {"label": area_name, "url": None}],
            area_name=area_name,
            rows=rows,
        )
        n_pages += 1

    # ---- ホーム ----
    def pick(pid):
        loc = by_id[pid]
        tzn = timezones.get(loc["tz"]) or {}
        return {
            "id": loc["id"], "name": loc["name"], "tz": loc["tz"],
            "country": loc["country"],
            "std": tzn.get("std", ""), "dst": tzn.get("dst", ""),
        }

    render(
        "home.html.j2",
        "index.html",
        title=f"世界時計 - 世界の時間と時差 - {SITE}",
        header="世界時計 - 世界の時間と時差",
        description=("世界の各都市の現在時刻・日本との時差・サマータイム情報を表示する世界時計。"
                     "現地時間と日本時間の変換や日の出日の入りの計算もできます。"),
        breadcrumb=None,
        featured=[pick(i) for i in FEATURED_IDS],
        areas=[{"id": a, "name": n} for a, n in AREA_ORDER],
        popular=[{"label": label,
                  "cities": [{"id": i, "name": by_id[i]["name"]} for i in ids]}
                 for label, ids in POPULAR],
        city_cols=[[{"id": i, "name": by_id[i]["name"]} for i in col]
                   for col in CITY_COLS],
        featured_countries=[
            {"alpha2": a2, "name": countries[a2]["name"]}
            for a2 in ["US", "CN", "KR", "TW", "TH", "SG", "IN", "AE", "GB",
                       "FR", "DE", "IT", "ES", "RU", "TR", "CA", "MX", "BR",
                       "AU", "NZ", "EG", "ZA"]
        ],
    )
    n_pages += 1

    # ---- 都市一覧 ----
    sections = []
    for area_id, area_name in AREA_ORDER:
        cities = sorted(
            (l for l in locations if l["area"] == area_id),
            key=lambda l: l["aiueo"])
        if cities:
            sections.append({"name": area_name, "cities": cities})
    render(
        "location_index.html.j2",
        "WorldTime/LocationIndex/index.html",
        title=f"世界の都市の一覧 - {SITE}",
        header="世界の都市の一覧",
        description="世界時計に掲載している世界の都市の一覧です。地域ごとに50音順に並んでいます。",
        breadcrumb=[{"label": "世界時計", "url": "/"},
                    {"label": "都市一覧", "url": None}],
        sections=sections,
    )
    n_pages += 1

    # ---- 検索 ----
    render(
        "search.html.j2",
        "Search/index.html",
        title=f"都市の検索 - {SITE}",
        header="都市の検索",
        description="世界時計の都市を日本語名・ふりがな・英語名・国名で検索できます。",
        breadcrumb=[{"label": "世界時計", "url": "/"},
                    {"label": "検索", "url": None}],
    )
    n_pages += 1

    # ---- Country(国)ページ ----
    redirects = []
    country_urls = {}  # alpha2 -> URL(一覧ページのリンク用)
    by_alpha2 = {}
    for l in locations:
        by_alpha2.setdefault(l["alpha2"], []).append(l)

    n_country = 0
    for a2, locs in sorted(by_alpha2.items()):
        c = countries.get(a2)
        if not c or a2 == "EU":
            continue
        zone_rows = sorted(
            (l for l in locs if 0 < l["kunibetsu"] < 30),
            key=lambda l: l["kunibetsu"])
        if not zone_rows:
            continue
        if zone_rows[0]["city_state"] == 1:
            target = f'/WorldTime/Location/{zone_rows[0]["id"]}'
            redirects.append(f"/WorldTime/Country/{a2} {target} 301")
            country_urls[a2] = target
            continue
        city_rows = sorted(
            (l for l in locs if 0 < l["kunibetsu"] < 200),
            key=lambda l: l["kunibetsu"])
        zones = []
        for z in zone_rows:
            tzn = timezones.get(z["tz"]) or {}
            zones.append({
                "id": z["id"], "tz": z["tz"],
                "heading": z["area_note"] or z["name"],
                "std": tzn.get("std", ""), "dst": tzn.get("dst", ""),
                "cities": [],
            })
        for cr in city_rows:
            key = cr["genzone"] or cr["tz"]
            if len(zones) == 1:
                zones[0]["cities"].append({"id": cr["id"], "name": cr["name"]})
                continue
            for zn in zones:
                if zn["id"] == key or zn["tz"] == key:
                    zn["cities"].append({"id": cr["id"], "name": cr["name"]})
                    break
        featured = zones[0]
        tzn0 = timezones.get(featured["tz"]) or {
            "std": "", "std_name": "", "dst": "", "dst_name": "", "has_dst": 0}
        title = f'{c["name"]}の時差と現在時刻'
        area = zone_rows[0]["area"]
        c_ctx = dict(c)
        c_ctx["wikipedia_link"] = wikipedia_link(c["wikipedia"])
        render(
            "country.html.j2",
            f"WorldTime/Country/{a2}/index.html",
            title=f"{title} - {SITE}",
            header=title,
            description=(
                f'{c["name"]}の現在時刻・日本との時差・サマータイム情報。'
                "現地時間と日本時間の変換計算もできます。"),
            breadcrumb=[
                {"label": "世界時計", "url": "/"},
                {"label": AREA_NAMES.get(area, area), "url": f"/WorldTime/Area/{area}"},
                {"label": c["name"], "url": None},
            ],
            country=c_ctx,
            zones=zones,
            featured=featured,
            multi=len(zones) > 1,
            place_json=json.dumps({
                "tz": featured["tz"], "name": c["name"],
                "lat": None, "lng": None, "tzn": tzn0,
            }, ensure_ascii=False, separators=(",", ":")),
        )
        country_urls[a2] = f"/WorldTime/Country/{a2}"
        n_country += 1
    n_pages += n_country
    print(f"Country: {n_country} ページ + citystate リダイレクト {len(redirects)} 件")

    # ---- Country/EU(EU加盟国一覧) ----
    eu_rows = []
    for a2, c in countries.items():
        if c.get("eu") != 1:
            continue
        rep = next((l for l in by_alpha2.get(a2, []) if l["kunibetsu"] == 1), None)
        if not rep:
            continue
        tzn = timezones.get(rep["tz"]) or {}
        eu_rows.append({
            "alpha2": a2, "country": c["name"], "id": rep["id"],
            "name": rep["name"], "tz": rep["tz"],
            "std": tzn.get("std", ""), "dst": tzn.get("dst", ""),
            "_aiueo": c["aiueo"],
        })
    eu_rows.sort(key=lambda r: r["_aiueo"])
    render(
        "eu.html.j2",
        "WorldTime/Country/EU/index.html",
        title=f"EU加盟国の現在時刻と時差一覧 - {SITE}",
        header="EU加盟国の現在時刻と時差一覧",
        description="EU(欧州連合)加盟国の現在時刻・UTCとの時差・サマータイム実施状況の一覧。",
        breadcrumb=[{"label": "世界時計", "url": "/"},
                    {"label": "ヨーロッパ", "url": "/WorldTime/Area/Europe"},
                    {"label": "EU", "url": None}],
        rows=eu_rows,
    )
    n_pages += 1

    # ---- 国の一覧 ----
    sections = []
    listed = [
        (a2, c) for a2, c in countries.items()
        if not a2.startswith("X") and c["aiueo"]
    ]
    for row_name, kana_chars in AIUEO_ROWS:
        cs = sorted(
            ((a2, c) for a2, c in listed if c["aiueo"][0] in kana_chars),
            key=lambda x: x[1]["aiueo"])
        if not cs:
            continue
        sections.append({
            "kana": row_name,
            "countries": [
                {"name": c["name"], "url": country_urls.get(a2)}
                for a2, c in cs
            ],
        })
    render(
        "list_of_countries.html.j2",
        "WorldTime/ListOfCountries/index.html",
        title=f"世界の国と地域の一覧 - {SITE}",
        header="世界の国と地域の一覧",
        description="世界の国と地域の一覧です。国名から時差と現在時刻のページを探せます。",
        breadcrumb=[{"label": "世界時計", "url": "/"},
                    {"label": "国と地域の一覧", "url": None}],
        sections=sections,
    )
    n_pages += 1

    # ---- カウントダウン ニューイヤー ----
    ny_areas = []
    for area_name, ids in NEWYEAR_AREAS:
        cities = []
        for i in ids:
            loc = by_id.get(i)
            if not loc:
                print(f"警告: NewYear の都市 {i} が見つかりません")
                continue
            tzn = timezones.get(loc["tz"]) or {}
            cities.append({
                "id": loc["id"], "name": loc["name"], "tz": loc["tz"],
                "lat": loc["lat"], "lng": loc["lng"],
                "std": tzn.get("std", ""), "dst": tzn.get("dst", ""),
            })
        ny_areas.append({"name": area_name, "cities": cities})
    render(
        "newyear.html.j2",
        "WorldTime/Home/NewYear/index.html",
        title=f"カウントダウン ニューイヤー 世界の新年と初日の出 - {SITE}",
        header="カウントダウン ニューイヤー 世界の新年と初日の出",
        description="世界の主要都市の新年へのカウントダウンと初日の出の時間。サマータイムを考慮しています。",
        breadcrumb=[{"label": "世界時計", "url": "/"},
                    {"label": "カウントダウン ニューイヤー", "url": None}],
        areas=ny_areas,
    )
    n_pages += 1

    # ---- 会議時間計算 ----
    render(
        "meeting.html.j2",
        "WorldTime/Meeting/index.html",
        title=f"世界の会議時間の計算 - {SITE}",
        header="世界の会議時間の計算",
        description="海外との会議・オンライン通話の時間調整ツール。複数都市の対応する時刻の一覧表を表示します。",
        breadcrumb=[{"label": "世界時計", "url": "/"},
                    {"label": "会議時間の計算", "url": None}],
    )
    n_pages += 1
    meeting = sorted(locations, key=lambda l: l["aiueo"])
    (PUBLIC / "data").mkdir(parents=True, exist_ok=True)
    (PUBLIC / "data" / "meeting.json").write_text(
        json.dumps(
            [[f'{l["name"]}({l["country"]})', l["id"], l["tz"]] for l in meeting],
            ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")

    # ---- Uc 記事 ----
    for tmpl_name, url_path, title in UC_PAGES:
        body = (ROOT / "templates" / "pages" / "uc" / f"{tmpl_name}.html").read_text(encoding="utf-8")
        render(
            "page.html.j2",
            f"{url_path}/index.html",
            title=f"{title} - {SITE}",
            header=title,
            description=title,
            breadcrumb=[{"label": "世界時計", "url": "/"},
                        {"label": title, "url": None}],
            body=body,
        )
        n_pages += 1

    # ---- _redirects ----
    for a2, target in SPECIAL_COUNTRY_REDIRECTS.items():
        redirects.append(f"/WorldTime/Country/{a2} /WorldTime/Location/{target} 301")
    for a2 in COUNTRY_SHORTCUTS:
        redirects.append(f"/WorldTime/{a2} /WorldTime/Country/{a2} 301")
    redirects.append("/Region/* /WorldTime/Area/:splat 301")
    (PUBLIC / "_redirects").write_text("\n".join(redirects) + "\n", encoding="utf-8")

    # ---- 静的ページ ----
    for name, title, header in [
        ("About", "このサイトについて", "このサイトについて"),
        ("PrivacyPolicy", "免責事項・プライバシーポリシー", "免責事項・プライバシーポリシー"),
    ]:
        body = (ROOT / "templates" / "pages" / f"{name}.html").read_text(encoding="utf-8")
        render(
            "page.html.j2",
            f"{name}/index.html",
            title=f"{title} - {SITE}",
            header=header,
            description=title,
            breadcrumb=[{"label": "世界時計", "url": "/"},
                        {"label": header, "url": None}],
            body=body,
        )
        n_pages += 1

    # ---- 検索用データ ----
    search = [[l["name"], l["aiueo"], l["country"], l["id"]] for l in locations]
    (PUBLIC / "data").mkdir(parents=True, exist_ok=True)
    (PUBLIC / "data" / "search.json").write_text(
        json.dumps(search, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")

    # ---- アセット ----
    shutil.copytree(ROOT / "assets", PUBLIC / "assets")
    # JS モジュール内の相互 import にもバージョンを付ける(キャッシュ更新のため)
    for js in (PUBLIC / "assets" / "js").glob("*.js"):
        code = js.read_text(encoding="utf-8")
        code = re.sub(r'(from\s+"/assets/js/\w+\.js)"', rf'\1?v={ASSET_VER}"', code)
        code = code.replace('"/assets/vendor/temporal-polyfill.global.min.js"',
                            f'"/assets/vendor/temporal-polyfill.global.min.js?v={ASSET_VER}"')
        js.write_text(code, encoding="utf-8")
    if (OLD_WWWROOT / "favicon.ico").exists():
        shutil.copy(OLD_WWWROOT / "favicon.ico", PUBLIC / "favicon.ico")
    for img in ["uc/earth.png",
                "DaylightSaving-World-Subdivisions7.png",
                "DaylightSaving-World-Subdivisions5.png"]:
        src = OLD_WWWROOT / "Images" / img
        if src.exists():
            dst = PUBLIC / "Images" / img
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, dst)
        else:
            print(f"警告: 画像 {img} が見つかりません")

    total = sum(1 for _ in PUBLIC.rglob("*") if _.is_file())
    print(f"ページ {n_pages} / 総ファイル {total} → public/")


if __name__ == "__main__":
    main()
