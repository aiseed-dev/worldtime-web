#!/usr/bin/env python3
"""世界地図の基図 SVG を生成する(assets/img/worldmap-base.svg、コミット対象)。

ソース: world.geo.json(Natural Earth 由来、パブリックドメイン)。
正距円筒図法(equirectangular)、viewBox 0 0 1000 500。再実行は基図更新時のみ。

usage: ./.venv/bin/python tools/build_worldmap.py [countries.geo.json のパス]
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "img" / "worldmap-base.svg"
SRC_URL = "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"

W, H = 1000, 500


def xy(lng, lat):
    return round((lng + 180) / 360 * W, 1), round((90 - lat) / 180 * H, 1)


def ring_path(ring):
    pts = [xy(p[0], p[1]) for p in ring]
    # 描画に効かない細かい点を間引く(0.5px 未満の移動はスキップ)
    out, last = [], None
    for p in pts:
        if last is None or abs(p[0] - last[0]) + abs(p[1] - last[1]) >= 0.5:
            out.append(p)
            last = p
    if len(out) < 3:
        return ""
    return "M" + " ".join(f"{x},{y}" for x, y in out) + "Z"


def main():
    if len(sys.argv) > 1:
        geo = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    else:
        req = urllib.request.Request(SRC_URL, headers={"User-Agent": "worldtime-web build"})
        with urllib.request.urlopen(req, timeout=60) as res:
            geo = json.loads(res.read())

    paths = []
    for feat in geo["features"]:
        g = feat["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for ring in poly:
                d = ring_path(ring)
                if d:
                    paths.append(d)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" id="worldmap">\n'
        f'<rect width="{W}" height="{H}" class="sea"/>\n'
        f'<path class="land" d="{" ".join(paths)}"/>\n'
        f'<g id="cities"></g>\n</svg>\n'
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(svg, encoding="utf-8")
    print(f"{OUT}: {len(paths)} ポリゴン / {OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
