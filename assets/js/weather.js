// 天気欄(現在の天気=METAR実測、予報=met.no)の描画。
// データは weather.time-j.net の /data/world/ から fetch する。
// 取得失敗・データ無しの場合は欄ごと非表示のまま(時計機能に影響しない)。
import { ready, pad2, wday, fmtHM } from "/assets/js/timej.js";

await ready;

const BASE = ["localhost", "127.0.0.1"].includes(location.hostname)
  ? "" : "https://weather.time-j.net";

const place = JSON.parse(document.getElementById("placeData").textContent);

// met.no symbol_code → 日本語(_day/_night/_polartwilight を除いた基本コード)
const SYM_JA = {
  clearsky: "快晴", fair: "晴れ", partlycloudy: "晴れ時々曇り", cloudy: "曇り",
  fog: "霧", lightrain: "小雨", rain: "雨", heavyrain: "大雨",
  lightrainshowers: "にわか雨(弱)", rainshowers: "にわか雨", heavyrainshowers: "激しいにわか雨",
  lightrainandthunder: "雷雨(弱)", rainandthunder: "雷雨", heavyrainandthunder: "激しい雷雨",
  lightrainshowersandthunder: "にわか雷雨", rainshowersandthunder: "にわか雷雨",
  heavyrainshowersandthunder: "激しいにわか雷雨",
  sleet: "みぞれ", lightsleet: "みぞれ(弱)", heavysleet: "強いみぞれ",
  sleetshowers: "にわかみぞれ", lightsleetshowers: "にわかみぞれ", heavysleetshowers: "強いにわかみぞれ",
  sleetandthunder: "みぞれと雷", sleetshowersandthunder: "にわかみぞれと雷",
  lightssleetshowersandthunder: "にわかみぞれと雷", heavysleetshowersandthunder: "強いにわかみぞれと雷",
  snow: "雪", lightsnow: "小雪", heavysnow: "大雪",
  snowshowers: "にわか雪", lightsnowshowers: "にわか雪(弱)", heavysnowshowers: "強いにわか雪",
  snowandthunder: "雪と雷", snowshowersandthunder: "にわか雪と雷",
  lightssnowshowersandthunder: "にわか雪と雷", heavysnowshowersandthunder: "強いにわか雪と雷",
};

const symJa = (code) => SYM_JA[(code || "").replace(/_(day|night|polartwilight)$/, "")] || "";

// METAR の天気コード → 日本語
const WX_JA = [
  ["TS", "雷"], ["FZ", "着氷性"], ["SH", "にわか"],
  ["DZ", "霧雨"], ["RA", "雨"], ["SN", "雪"], ["SG", "霧雪"], ["GR", "ひょう"], ["GS", "あられ"],
  ["BR", "もや"], ["FG", "霧"], ["FU", "煙"], ["DU", "砂じん"], ["SA", "砂"], ["HZ", "煙霧"],
  ["SQ", "スコール"], ["DS", "砂嵐"], ["SS", "砂嵐"], ["PO", "じん旋風"], ["VC", "近傍で"],
];

function wxJa(wx) {
  if (!wx) return "";
  let s = wx.split(" ")[0];
  let out = "";
  if (s.startsWith("-")) { out += "弱い"; s = s.slice(1); }
  else if (s.startsWith("+")) { out += "強い"; s = s.slice(1); }
  for (const [code, ja] of WX_JA) {
    if (s.includes(code)) { out += ja; s = s.replace(code, ""); }
  }
  return out || wx;
}

// 雲量から天気(現象が無いとき用)
function cloudJa(clouds) {
  const order = { CAVOK: 0, CLR: 0, SKC: 0, NSC: 0, FEW: 1, SCT: 2, BKN: 3, OVC: 4 };
  let worst = 0;
  for (const c of clouds || []) worst = Math.max(worst, order[c.cover] ?? 0);
  return ["快晴", "晴れ", "晴れ時々曇り", "曇り", "曇り(全天)"][worst];
}

// 相対湿度(Magnus 式)
function humidity(t, td) {
  if (t == null || td == null) return null;
  const e = (x) => Math.exp((17.625 * x) / (243.04 + x));
  return Math.round(100 * e(td) / e(t));
}

const dirJa = (deg) => deg == null ? "" :
  ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東",
   "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"][
    Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];

async function getJson(path) {
  try {
    const res = await fetch(BASE + path);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function localTime(iso) {
  const zdt = Temporal.Instant.from(iso).toZonedDateTimeISO(place.tz);
  return `${zdt.month}/${zdt.day}(${wday(zdt)}) ${fmtHM(zdt)}`;
}

async function renderCurrent(section) {
  const d = await getJson(`/data/world/metar/${section.dataset.icao}.json`);
  if (!d || d.temp == null) return;
  const items = [];
  items.push(`天気: ${d.wx ? wxJa(d.wx) : cloudJa(d.clouds)}`);
  items.push(`気温: ${d.temp}°C`);
  const rh = humidity(d.temp, d.dewp);
  if (rh != null) items.push(`湿度: ${rh}%`);
  if (d.wspd_kt != null) {
    items.push(`風: ${dirJa(d.wdir)} ${Math.round(d.wspd_kt * 0.514 * 10) / 10}m/s`);
  }
  section.querySelector(".wx-body").innerHTML =
    `<p>${items.join("　")}</p>
     <p class="muted">${localTime(d.time)} の空港の観測(METAR)。出典: aviationweather.gov</p>`;
  section.hidden = false;
}

async function renderForecast(section) {
  const d = await getJson(`/data/world/forecast/${section.dataset.place}.json`);
  if (!d || !d.daily?.length) return;
  let html = '<div class="scroll-x"><table class="list"><thead><tr>' +
    "<th>日付</th><th>天気</th><th>最低/最高気温</th><th>降水量</th></tr></thead><tbody>";
  for (const day of d.daily) {
    const pd = Temporal.PlainDate.from(day.date);
    html += `<tr><td>${pd.month}/${pd.day}(${wday(pd)})</td>` +
      `<td>${symJa(day.sym) || "-"}</td>` +
      `<td>${day.tmin}°C / ${day.tmax}°C</td>` +
      `<td>${day.pre > 0 ? day.pre + "mm" : "-"}</td></tr>`;
  }
  html += "</tbody></table></div>" +
    `<p class="muted">予報データ: MET Norway (CC BY 4.0)、発表 ${localTime(d.updated)}(現地時間)</p>`;
  section.querySelector(".wx-body").innerHTML = html;
  section.hidden = false;
}

const cur = document.getElementById("wx-current");
const fc = document.getElementById("wx-forecast");
if (cur) renderCurrent(cur);
if (fc) renderForecast(fc);
