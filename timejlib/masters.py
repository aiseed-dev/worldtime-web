"""旧 WorldTimeCore の App_Data マスター(TSV/JSON)を読み込む。

スキーマは DATA_CONTRACT.md を参照。列名は旧 TSV のヘッダーに依存する。
"""
import csv
import json
from pathlib import Path

APP_DATA = Path("/home/saki/dev/WorldTimeCore/WorldTimeCore/App_Data")

AREA_NAMES = {
    "Africa": "アフリカ",
    "Antarctica": "南極",
    "Arctic": "北極",
    "Asia": "アジア",
    "Atlantic": "大西洋",
    "Australia": "オーストラリア",
    "Europe": "ヨーロッパ",
    "Indian": "インド洋",
    "NorthAmerica": "北アメリカ",
    "Pacific": "太平洋",
    "SouthAmerica": "南アメリカ",
}


# tzdb で Link(廃止エイリアス)になっている ID を正式 ID へ正規化する
TZ_ALIASES = {
    "Asia/Chongqing": "Asia/Shanghai",
    "America/Godthab": "America/Nuuk",
    "Europe/Kiev": "Europe/Kyiv",
}


def _read_tsv(name):
    with open(APP_DATA / name, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def _read_json(name):
    with open(APP_DATA / name, encoding="utf-8") as f:
        return json.load(f)


def _to_int(s, default=0):
    try:
        return int(s)
    except (TypeError, ValueError):
        return default


def _to_float(s, default=None):
    try:
        return float(s)
    except (TypeError, ValueError):
        return default


def load_countries():
    tz_desc = _read_json("dic国別時間帯説明.json")
    tz_note = _read_json("dic国別時間帯備考.json")
    tz_tz_note = _read_json("dic国別時間帯Tz備考.json")
    countries = {}
    for r in _read_tsv("TWorld.tsv"):
        a2 = r["Alpha2"].strip()
        if not a2:
            continue
        countries[a2] = {
            "name": r["ShortName"].strip(),
            "full_name": r["FullName"].strip(),
            "name_e": r["NameE"].strip(),
            "capital": r["CapitalJ"].strip(),
            "aiueo": r["Aiueo"].strip(),
            "wikipedia": r["WikipediaJ"].strip(),
            "area_km2": _to_float(r["Area"]),
            "popu": _to_float(r["Popu2007"]),
            "eu": _to_int(r["Eu"]),
            "tz_desc": tz_desc.get(a2, ""),
            "tz_note": tz_note.get(a2, ""),
            "tz_tz_note": tz_tz_note.get(a2, ""),
        }
    # 旧 TWorld.tsv の未更新を補正: イギリスは 2020 年に EU 離脱
    if "GB" in countries:
        countries["GB"]["eu"] = 0
    return countries


def load_timezones():
    zones = {}
    for r in _read_tsv("時間帯.tsv"):
        zid = r["Id"].strip()
        if not zid:
            continue
        zid = TZ_ALIASES.get(zid, zid)
        zones[zid] = {
            "std": r["StandardName"].strip(),
            "std_name": r["タイムゾーン名"].strip(),
            "dst": r["DstName"].strip(),
            "dst_name": r["夏時間タイムゾーン名"].strip(),
            "has_dst": _to_int(r["夏時間"]),
        }
    return zones


def load_locations(countries):
    notes = _read_json("dic場所別時間帯備考.json")
    locations = []
    for r in _read_tsv("場所別時間帯.tsv"):
        pid = r["場所"].strip()
        if not pid:
            continue
        a2 = r["alpha2"].strip()
        locations.append({
            "id": pid,
            "name": r["名前"].strip(),
            "tz": TZ_ALIASES.get(r["時間帯"].strip(), r["時間帯"].strip()),
            "alpha2": a2,
            "state": r["state"].strip(),
            "country": countries.get(a2, {}).get("name", ""),
            "wikipedia": r["wikipedia"].strip(),
            "lat": _to_float(r["lat"]),
            "lng": _to_float(r["lng"]),
            "aiueo": r["aiueo"].strip(),
            "area": r["area"].strip(),
            "area_show": _to_int(r["area表示"]),
            "area_note": r["area備考"].strip(),
            "kunibetsu": _to_int(r["国別表示"]),
            "city_state": _to_int(r["citystate"]),
            "genzone": TZ_ALIASES.get(r["現ゾーン"].strip(), r["現ゾーン"].strip()),
            "wmo": r["wmo"].strip(),
            "note": notes.get(pid, ""),
        })
    return locations


def load_states():
    states = {}
    for r in _read_tsv("TState.tsv"):
        key = f'{r["Country"].strip()}/{r["Code"].strip()}'
        states[key] = {
            "country": r["Country"].strip(),
            "code": r["Code"].strip(),
            "title": r["Title"].strip(),
            "title_j": r["Titlej"].strip(),
            "wikipedia": r["Wikipedia"].strip(),
            "timezone": r["Timezone"].strip(),
        }
    return states


def load_climate():
    climate = {}
    for r in _read_json("TClimatologicalInfo.json"):
        code = r.get("Code", "").strip()
        if not code:
            continue
        series = []
        try:
            info = json.loads(r.get("Info") or "{}")
        except json.JSONDecodeError:
            info = {}
        for s in info.get("Info", []):
            data = []
            for v in s.get("data", []):
                try:
                    data.append(float(v))
                except (TypeError, ValueError):
                    data.append(None)
            series.append({"name": s.get("name", ""), "data": data})
        climate[code] = {
            "city_name": r.get("CityName", ""),
            "institute": r.get("MeteorologyInsti", ""),
            "url": r.get("Url", ""),
            "series": series,
        }
    return climate
