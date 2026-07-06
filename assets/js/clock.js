// ページ内の時計要素を毎秒更新する
//   <time data-clock data-tz="Asia/Tokyo" data-fmt="hms|mdhm|full"></time>
//   <span data-abbr data-tz="..." data-std="EST" data-dst="EDT"></span>  略称
//   <span data-off data-tz="..."></span>   UTC との時差 "+9"
//   <span data-dst-mark data-tz="..."></span>  サマータイム中マーク
import {
  ready, fmtHMS, fmtHM, fmtMD, fmtDateJa,
  offsetString, zoneMeta, zoneAbbr, everySecond,
} from "/assets/js/timej.js";

await ready;

const clocks = [...document.querySelectorAll("[data-clock]")];
const abbrs = [...document.querySelectorAll("[data-abbr]")];
const offs = [...document.querySelectorAll("[data-off]")];
const marks = [...document.querySelectorAll("[data-dst-mark]")];

function zdtOf(now, tz, cache) {
  let z = cache.get(tz);
  if (!z) {
    z = now.toZonedDateTimeISO(tz);
    cache.set(tz, z);
  }
  return z;
}

function render() {
  const now = Temporal.Now.instant();
  const cache = new Map();
  for (const el of clocks) {
    const zdt = zdtOf(now, el.dataset.tz, cache);
    const fmt = el.dataset.fmt || "hms";
    if (fmt === "hms") el.textContent = fmtHMS(zdt);
    else if (fmt === "mdhm") el.textContent = `${fmtMD(zdt)} ${fmtHM(zdt)}`;
    else el.textContent = `${fmtDateJa(zdt)} ${fmtHMS(zdt)}`;
  }
  for (const el of abbrs) {
    const zdt = zdtOf(now, el.dataset.tz, cache);
    el.textContent = zoneAbbr(zdt, el.dataset.std || "", el.dataset.dst || "");
  }
  for (const el of offs) {
    const zdt = zdtOf(now, el.dataset.tz, cache);
    el.textContent = offsetString(zdt.offsetNanoseconds);
  }
  for (const el of marks) {
    const zdt = zdtOf(now, el.dataset.tz, cache);
    el.hidden = !zoneMeta(el.dataset.tz).isDst(zdt);
  }
}

everySecond(render);
