#!/usr/bin/env python3
"""取得・変換層: 旧 App_Data マスター → data/*.json

usage: python3 build_data.py
"""
import json
from pathlib import Path

from timejlib import masters

DATA = Path(__file__).parent / "data"


def dump(name, obj):
    DATA.mkdir(exist_ok=True)
    with open(DATA / name, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    n = len(obj)
    print(f"data/{name}: {n} 件")
    return n


def main():
    countries = masters.load_countries()
    locations = masters.load_locations(countries)
    timezones = masters.load_timezones()

    # 整合性チェック: 都市の tz が timezones に存在するか
    missing_tz = sorted({l["tz"] for l in locations} - set(timezones))
    if missing_tz:
        print(f"警告: 時間帯.tsv に無い tz {len(missing_tz)} 件: {missing_tz[:10]}")
    missing_c = sorted({l["alpha2"] for l in locations} - set(countries) - {""})
    if missing_c:
        print(f"警告: TWorld.tsv に無い国 {missing_c}")

    dump("locations.json", locations)
    dump("timezones.json", timezones)
    dump("countries.json", countries)
    dump("states.json", masters.load_states())
    climate = masters.load_climate()
    dump("climate.json", climate)
    missing_w = sorted({l["wmo"] for l in locations if l["wmo"]} - set(climate))
    if missing_w:
        print(f"警告: climate に無い wmo {len(missing_w)} 件: {missing_w[:10]}")


if __name__ == "__main__":
    main()
