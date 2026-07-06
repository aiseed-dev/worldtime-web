// 日の出・日の入り計算(NOAA の太陽位置アルゴリズム)
// 旧 SunCalculator.cs の置き換え。精度は±数分程度。

const RAD = Math.PI / 180;

function julianDay(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
}

function solarCalc(jd) {
  const t = (jd - 2451545) / 36525;
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c = Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t)
    + Math.sin(3 * m * RAD) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const e0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = e0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) / RAD;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTime = 4 / RAD * (y * Math.sin(2 * l0 * RAD)
    - 2 * e * Math.sin(m * RAD)
    + 4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD)
    - 0.5 * y * y * Math.sin(4 * l0 * RAD)
    - 1.25 * e * e * Math.sin(2 * m * RAD));
  return { decl, eqTime };
}

// UTC 暦日 utcDate におけるイベント時刻(UTC 分)を計算
function eventMinutes(utcDate, lat, lng, kind) {
  const jd = julianDay(utcDate.year, utcDate.month, utcDate.day);
  const { decl, eqTime } = solarCalc(jd);
  const h0 = 90.833; // 大気差+視半径
  const cosHa = (Math.cos(h0 * RAD) - Math.sin(lat * RAD) * Math.sin(decl * RAD))
    / (Math.cos(lat * RAD) * Math.cos(decl * RAD));
  if (cosHa > 1) return { polar: "night" };
  if (cosHa < -1) return { polar: "day" };
  const ha = Math.acos(cosHa) / RAD;
  const min = kind === "rise"
    ? 720 - 4 * (lng + ha) - eqTime
    : 720 - 4 * (lng - ha) - eqTime;
  return { min };
}

// 現地の暦日 date に起きるイベントを探す。UTC+14 等では UTC 暦日が現地とずれるため
// UTC 暦日を前後にずらしながら現地日付が一致する結果を採用する。
function eventFor(date, lat, lng, tz, kind) {
  for (const shift of [0, -1, 1]) {
    const utcDate = date.add({ days: shift });
    const r = eventMinutes(utcDate, lat, lng, kind);
    if (r.polar) return r;
    const zdt = utcDate.toZonedDateTime("UTC")
      .add({ seconds: Math.round(r.min * 60) })
      .withTimeZone(tz);
    if (zdt.toPlainDate().equals(date)) return { zdt };
  }
  return { zdt: null };
}

// date: Temporal.PlainDate、戻り値: {rise, set: Temporal.ZonedDateTime|null, polar: null|"day"|"night"}
export function sunTimes(date, lat, lng, tz) {
  const rise = eventFor(date, lat, lng, tz, "rise");
  const set = eventFor(date, lat, lng, tz, "set");
  if (rise.polar || set.polar) {
    return { rise: null, set: null, polar: rise.polar || set.polar };
  }
  return { rise: rise.zdt ?? null, set: set.zdt ?? null, polar: null };
}
