// 世界の天気地図: ズーム/パンと、weather.time-j.net の map.json による気温表示
const BASE = ["localhost", "127.0.0.1"].includes(location.hostname)
  ? "" : "https://weather.time-j.net";

const svg = document.getElementById("worldmap");
const W = 1000, H = 500;
let vb = [0, 0, W, H];

function apply() {
  svg.setAttribute("viewBox", vb.join(" "));
  const z = W / vb[2];
  svg.classList.toggle("z2", z >= 2.2);
  svg.classList.toggle("z3", z >= 4.5);
}

function zoom(factor, cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2) {
  const w = Math.min(W, Math.max(60, vb[2] / factor));
  const h = w / 2;
  vb = [
    Math.min(W - w, Math.max(0, cx - (cx - vb[0]) * (w / vb[2]))),
    Math.min(H - h, Math.max(0, cy - (cy - vb[1]) * (h / vb[3]))),
    w, h,
  ];
  apply();
}

document.getElementById("map-in").addEventListener("click", () => zoom(1.6));
document.getElementById("map-out").addEventListener("click", () => zoom(1 / 1.6));
document.getElementById("map-reset").addEventListener("click", () => { vb = [0, 0, W, H]; apply(); });

svg.addEventListener("wheel", (e) => {
  e.preventDefault();
  const pt = toMap(e);
  zoom(e.deltaY < 0 ? 1.3 : 1 / 1.3, pt.x, pt.y);
}, { passive: false });

function toMap(e) {
  const r = svg.getBoundingClientRect();
  return {
    x: vb[0] + (e.clientX - r.left) / r.width * vb[2],
    y: vb[1] + (e.clientY - r.top) / r.height * vb[3],
  };
}

let drag = null;
svg.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, vb: [...vb] }; });
window.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const r = svg.getBoundingClientRect();
  vb[0] = Math.min(W - vb[2], Math.max(0, drag.vb[0] - (e.clientX - drag.x) / r.width * vb[2]));
  vb[1] = Math.min(H - vb[3], Math.max(0, drag.vb[1] - (e.clientY - drag.y) / r.height * vb[3]));
  apply();
});
window.addEventListener("pointerup", () => { drag = null; });

// ---- 気温の描画 ----
const tempClass = (t) =>
  t <= -10 ? "t-frigid" : t <= 0 ? "t-cold" : t <= 10 ? "t-cool"
    : t <= 20 ? "t-mild" : t <= 30 ? "t-warm" : "t-hot";

async function loadTemps() {
  try {
    const res = await fetch(BASE + "/data/world/map.json");
    if (!res.ok) return;
    const d = await res.json();
    const ns = "http://www.w3.org/2000/svg";
    for (const c of d.cities) {
      if (c.t == null) continue;
      const a = svg.querySelector(`a[data-p="${CSS.escape(c.p)}"]`);
      if (!a) continue;
      a.querySelector("circle").classList.add(tempClass(c.t));
      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", Number(a.dataset.x) + 2.2);
      label.setAttribute("y", Number(a.dataset.y) + 1.2);
      label.setAttribute("class", "tmp");
      label.textContent = c.t + "°";
      a.appendChild(label);
    }
    const upd = document.getElementById("map-updated");
    if (upd) upd.textContent = `気温の観測時刻: ${d.updated.replace("T", " ").replace("Z", " UTC")}(都市により多少前後します)`;
  } catch { /* 気温なしでも地図は機能する */ }
}

apply();
loadTemps();
