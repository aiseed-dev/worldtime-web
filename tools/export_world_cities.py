#!/usr/bin/env python3
"""WeatherStatic へ渡す世界都市マスター(master/world_cities.json)を生成する。

worldtime-web の data/locations.json から、天気データ(予報・METAR)の対象都市を
抽出して WeatherStatic/master/ に書き出す。都市マスターの一次管理は worldtime 側。

usage: ./.venv/bin/python tools/export_world_cities.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path("/home/saki/dev/weather/WeatherStatic/master/world_cities.json")


def main():
    with open(ROOT / "data" / "locations.json", encoding="utf-8") as f:
        locations = json.load(f)

    cities = []
    for l in locations:
        if not l["forecast"] and not l["icao"]:
            continue
        cities.append({
            "place": l["id"],          # URL/ファイルパス用 ID(例 Asia/Tokyo)
            "name": l["name"],
            "country": l["country"],
            "lat": l["lat"],
            "lng": l["lng"],
            "tz": l["tz"],
            "icao": l["icao"],         # 空 = METAR なし
            "forecast": l["forecast"],  # true = met.no 予報の対象
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"cities": cities}, f, ensure_ascii=False, indent=1)
    n_fc = sum(1 for c in cities if c["forecast"])
    n_mt = sum(1 for c in cities if c["icao"])
    print(f"{OUT}: {len(cities)} 都市(予報 {n_fc} / METAR {n_mt})")


if __name__ == "__main__":
    main()
