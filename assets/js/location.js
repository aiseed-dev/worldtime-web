// Location(都市詳細)ページの動的部分
// ページに埋め込まれた #placeData(DATA_CONTRACT.md §7)と Temporal のみで動く。
import {
  ready, pad2, fmtHMS, fmtDateJa, fmtMDJa, fmtHM,
  offsetString, spanJa, zoneMeta, zoneAbbr, nextTransition, jstDiffNs, everySecond,
} from "/assets/js/timej.js";
import { sunTimes } from "/assets/js/sun.js";

await ready;

const place = JSON.parse(document.getElementById("placeData").textContent);
const TZ = place.tz;
const tzn = place.tzn;
const $ = (id) => document.getElementById(id);

// ---- 現在時刻(毎秒) ----
function tick() {
  const zdt = Temporal.Now.zonedDateTimeISO(TZ);
  $("currentTime").textContent = `${fmtDateJa(zdt)} ${fmtHMS(zdt)}`;
  $("tzname").textContent = zoneAbbr(zdt, tzn.std, tzn.dst);
  $("isdst").textContent = zoneMeta(TZ).isDst(zdt) ? "サマータイム中" : "";
  const jst = zdt.withTimeZone("Asia/Tokyo");
  $("currentTimej").textContent = `${fmtMDJa(jst)} ${fmtHM(jst)}`;
}

// ---- タイムゾーン情報(初期化時) ----
function renderZoneInfo() {
  const zdt = Temporal.Now.zonedDateTimeISO(TZ);
  const isDst = zoneMeta(TZ).isDst(zdt);
  const abbr = zoneAbbr(zdt, tzn.std, tzn.dst);
  const longName = (isDst ? tzn.dst_name : tzn.std_name) || "";
  $("zname").textContent = `${abbr} ${longName}`.trim();
  $("zutc").textContent = "UTC" + offsetString(zdt.offsetNanoseconds);
  const dj = jstDiffNs(zdt);
  $("zjst").textContent = "JST" + offsetString(dj);
  let s;
  if (dj === 0) {
    s = `現在の日本と${place.name}との時差はありません。日本と同じ時刻です。`;
  } else {
    const rel = dj > 0
      ? `${place.name}の方が日本より${spanJa(dj)}進んでいます`
      : `日本の方が${place.name}より${spanJa(dj)}進んでいます`;
    s = `現在の日本と${place.name}との時差は${spanJa(dj)}です。${rel}。`;
  }
  $("zdesc").textContent = s;
}

// ---- サマータイム情報 ----
function renderDstInfo() {
  const el = $("dstinfo");
  const zdt = Temporal.Now.zonedDateTimeISO(TZ);
  const meta = zoneMeta(TZ);
  if (!tzn.has_dst && !meta.variable) {
    el.textContent = "サマータイム(夏時間)は実施していません。";
    return null;
  }
  const tr = nextTransition(zdt);
  if (!tr) {
    el.textContent = "サマータイム(夏時間)の切替予定はありません。";
    return null;
  }
  const isDstNow = meta.isDst(zdt);
  const after = tr; // 切替後の壁時計時刻
  const abbrAfter = zoneAbbr(after, tzn.std, tzn.dst);
  const what = meta.isDst(after) ? "サマータイムが開始します" : "サマータイムが終了します";
  const state = isDstNow ? "現在サマータイム期間中です。" : "現在は標準時間です。";
  el.textContent = `${state}${fmtDateJa(after)} ${fmtHM(after)} (${abbrAfter}) に${what}。`;
  return tr;
}

// ---- 時差早見表 ----
function reckonerTable(offsetNs, caption) {
  const diffJstMin = Number(BigInt(offsetNs - 9 * 3.6e12) / 60_000_000_000n);
  const diffUtcMin = Number(BigInt(offsetNs) / 60_000_000_000n);
  const rows = [
    ["現地時間", (n) => n, true],
    ["日本時間", (n) => ((n - Math.trunc(diffJstMin / 60)) % 24 + 24) % 24, true],
    ["UTC", (n) => ((n - Math.trunc(diffUtcMin / 60)) % 24 + 24) % 24, false],
  ];
  let html = caption ? `<div class="next">${caption}</div>` : "";
  html += '<div class="scroll-x"><table class="wtable"><tbody>';
  for (const [label, f, work] of rows) {
    html += `<tr><th>${label}</th>`;
    for (let n = 0; n < 24; n++) {
      const v = f(n);
      const cls = work && v > 8 && v < 18 ? ' class="working"' : "";
      html += `<td${cls}>${v}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table></div>";
  const m = ((diffJstMin % 60) + 60) % 60;
  if (m !== 0) {
    html += `<p>分の差もあります。正確な変換には上の「日本時間との変換」を使ってください。</p>`;
  }
  return html;
}

function renderReckoner(tr) {
  const zdt = Temporal.Now.zonedDateTimeISO(TZ);
  let html = reckonerTable(zdt.offsetNanoseconds, "");
  if (tr && tr.offsetNanoseconds !== zdt.offsetNanoseconds) {
    // 300日以内に切替がある場合は切替後の表も表示(旧サイト同等)
    const untilMs = tr.toInstant().epochMilliseconds - Date.now();
    if (untilMs < 300 * 86400_000) {
      html += reckonerTable(
        tr.offsetNanoseconds,
        `${fmtMDJa(tr)} ${fmtHM(tr)} (${zoneAbbr(tr, tzn.std, tzn.dst)}) 以降`,
      );
    }
  }
  $("reckoner").innerHTML = html;
}

// ---- 日本時間との変換 ----
function fillSelects(form, zdt) {
  const opts = (el, from, to, sel) => {
    if (!el) return;
    el.innerHTML = "";
    for (let i = from; i <= to; i++) {
      el.add(new Option(i, i, false, i === sel));
    }
  };
  opts(form.querySelector(".f-year"), zdt.year - 1, zdt.year + 2, zdt.year);
  opts(form.querySelector(".f-month"), 1, 12, zdt.month);
  opts(form.querySelector(".f-day"), 1, 31, zdt.day);
  opts(form.querySelector(".f-hour"), 0, 23, zdt.hour);
  const mm = form.querySelector(".f-minute");
  if (mm) {
    mm.innerHTML = "";
    for (let i = 0; i < 60; i += 5) {
      mm.add(new Option(pad2(i), i, false, i === Math.floor(zdt.minute / 5) * 5));
    }
  }
}

function readSelects(form) {
  const v = (c) => {
    const el = form.querySelector(c);
    return el ? Number(el.value) : 0;
  };
  return {
    year: v(".f-year"), month: v(".f-month"), day: v(".f-day"),
    hour: v(".f-hour"), minute: v(".f-minute"),
  };
}

function convert(form, out, fromTz, toTz, toLabel, toAbbr) {
  try {
    const pdt = Temporal.PlainDateTime.from({ ...readSelects(form), overflow: "reject" });
    const dst = pdt.toZonedDateTime(fromTz, { disambiguation: "compatible" }).withTimeZone(toTz);
    out.textContent = `${toLabel}: ${fmtDateJa(dst)} ${fmtHM(dst)} ${toAbbr(dst)}`;
  } catch {
    out.textContent = "日付が正しくありません。";
  }
}

function setupConverters() {
  const nowL = Temporal.Now.zonedDateTimeISO(TZ);
  const nowJ = Temporal.Now.zonedDateTimeISO("Asia/Tokyo");
  const fl = $("fromltoj"), fj = $("fromjtol");
  fillSelects(fl, nowL);
  fillSelects(fj, nowJ);
  $("btn-ltoj").addEventListener("click", () =>
    convert(fl, $("ltoj"), TZ, "Asia/Tokyo", "日本時間", () => "JST"));
  $("btn-jtol").addEventListener("click", () =>
    convert(fj, $("jtol"), "Asia/Tokyo", TZ, `${place.name}の現地時間`,
      (z) => zoneAbbr(z, tzn.std, tzn.dst)));
}

// ---- 日の出・日の入り ----
function renderSun(date) {
  const out = $("suncontent");
  if (place.lat == null || place.lng == null) {
    out.textContent = "";
    return;
  }
  const r = sunTimes(date, place.lat, place.lng, TZ);
  const d = `${date.year}年${date.month}月${date.day}日`;
  if (r.polar === "day") {
    out.textContent = `${d}は白夜(太陽が沈みません)。`;
  } else if (r.polar === "night") {
    out.textContent = `${d}は極夜(太陽が昇りません)。`;
  } else if (!r.rise || !r.set) {
    out.textContent = `${d}の日の出・日の入りは計算できませんでした。`;
  } else {
    const len = r.rise.until(r.set);
    out.textContent =
      `${d}の日の出は ${fmtHM(r.rise)}、日の入りは ${fmtHM(r.set)}、昼の長さは約${len.hours}時間${len.minutes}分です。`;
  }
}

function setupSun() {
  if (!$("sunform")) return;
  const now = Temporal.Now.zonedDateTimeISO(TZ);
  fillSelects($("sunform"), now);
  renderSun(now.toPlainDate());
  $("btn-sun").addEventListener("click", () => {
    try {
      const v = readSelects($("sunform"));
      renderSun(Temporal.PlainDate.from({ year: v.year, month: v.month, day: v.day, overflow: "reject" }));
    } catch {
      $("suncontent").textContent = "日付が正しくありません。";
    }
  });
}

// ---- 初期化 ----
renderZoneInfo();
const tr = renderDstInfo();
renderReckoner(tr);
setupConverters();
setupSun();
everySecond(tick);
// オフセットが変わった時(サマータイム切替)に静的部分を作り直す
let lastOffset = Temporal.Now.zonedDateTimeISO(TZ).offsetNanoseconds;
setInterval(() => {
  const o = Temporal.Now.zonedDateTimeISO(TZ).offsetNanoseconds;
  if (o !== lastOffset) {
    lastOffset = o;
    renderZoneInfo();
    renderReckoner(renderDstInfo());
  }
}, 60_000);
