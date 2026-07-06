// Temporal ブートストラップと時刻計算の共通ヘルパー
// Temporal 未対応ブラウザ(Safari 等)ではポリフィルを動的に読み込む。
// 各ページのモジュールは `await ready` してから Temporal を使うこと。

export const ready = (async () => {
  if (typeof globalThis.Temporal !== "undefined") return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/assets/vendor/temporal-polyfill.global.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Temporal polyfill の読み込みに失敗しました"));
    document.head.appendChild(s);
  });
})();

const HOUR_NS = 3_600_000_000_000n;
const JST_OFFSET_NS = 9n * HOUR_NS;

export const WDAYS = ["月", "火", "水", "木", "金", "土", "日"]; // dayOfWeek 1=月..7=日

export const pad2 = (n) => String(n).padStart(2, "0");

export const wday = (zdt) => WDAYS[zdt.dayOfWeek - 1];

export const fmtHMS = (zdt) => `${pad2(zdt.hour)}:${pad2(zdt.minute)}:${pad2(zdt.second)}`;
export const fmtHM = (zdt) => `${pad2(zdt.hour)}:${pad2(zdt.minute)}`;
export const fmtMD = (zdt) => `${zdt.month}/${zdt.day}(${wday(zdt)})`;
export const fmtDateJa = (zdt) => `${zdt.year}年${zdt.month}月${zdt.day}日(${wday(zdt)})`;
export const fmtMDJa = (zdt) => `${zdt.month}月${zdt.day}日(${wday(zdt)})`;

// オフセット(ns)を "+9" "-3:30" "±0" 形式に
export function offsetString(ns) {
  const min = Number(BigInt(ns) / 60_000_000_000n);
  if (min === 0) return "±0";
  const sign = min < 0 ? "-" : "+";
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return sign + h + (m ? ":" + pad2(m) : "");
}

// 時間差(ns)を "2時間30分" 形式に(符号なし)
export function spanJa(ns) {
  const min = Math.abs(Number(BigInt(ns) / 60_000_000_000n));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  return `${h}時間` + (m ? `${m}分` : "");
}

// タイムゾーンのメタ情報。std_offset_ns は 1月/7月のオフセットの小さい方(標準時)。
const zoneCache = new Map();
export function zoneMeta(tz) {
  let z = zoneCache.get(tz);
  if (z) return z;
  const now = Temporal.Now.zonedDateTimeISO(tz);
  const jan = now.with({ month: 1, day: 15 });
  const jul = now.with({ month: 7, day: 15 });
  const stdNs = jan.offsetNanoseconds <= jul.offsetNanoseconds
    ? jan.offsetNanoseconds : jul.offsetNanoseconds;
  z = {
    stdNs,
    variable: jan.offsetNanoseconds !== jul.offsetNanoseconds,
    isDst(zdt) { return zdt.offsetNanoseconds > this.stdNs; },
  };
  zoneCache.set(tz, z);
  return z;
}

// 略称の決定: DST 中なら dst 名、なければ "UTC+9" 形式でフォールバック
export function zoneAbbr(zdt, std, dst) {
  const meta = zoneMeta(zdt.timeZoneId);
  const name = meta.isDst(zdt) ? dst : std;
  return name || "UTC" + offsetString(zdt.offsetNanoseconds);
}

// 次のオフセット切替。無ければ null
export function nextTransition(zdt) {
  if (typeof zdt.getTimeZoneTransition === "function") {
    return zdt.getTimeZoneTransition("next");
  }
  return null;
}

// 日本(JST)との時差 ns
export function jstDiffNs(zdt) {
  return zdt.offsetNanoseconds - Number(JST_OFFSET_NS);
}

// 秒境界に合わせて cb を繰り返し呼ぶ
export function everySecond(cb) {
  const loop = () => {
    cb();
    setTimeout(loop, 1000 - (Date.now() % 1000) + 10);
  };
  loop();
}
