// カウントダウン ニューイヤー: 各都市の新年・初日の出までの残り時間
import { ready, pad2, fmtHM, everySecond } from "/assets/js/timej.js";
import { sunTimes } from "/assets/js/sun.js";

await ready;

// 次に迎える1月1日(すでに年が明けた都市はその年の1月1日を過ぎている → 表示は 0)
const thisYear = Temporal.Now.zonedDateTimeISO("Asia/Tokyo").year;
const target = { year: thisYear + 1, month: 1, day: 1 };
// 12月でなければ「今年の新年」を過ぎて久しいので、直近の新年(今年)を対象にカウント済み扱い
const nowJst = Temporal.Now.zonedDateTimeISO("Asia/Tokyo");
if (nowJst.month === 1) target.year = thisYear; // 1月中は今年の新年(通過済み含む)を表示

document.title = document.title.replace("ニューイヤー", `ニューイヤー ${target.year}`);
const h1 = document.querySelector("main h1");
if (h1) h1.textContent = h1.textContent.replace("ニューイヤー", `ニューイヤー ${target.year}`);

const rows = [...document.querySelectorAll(".ny-row")].map((tr) => {
  const tz = tr.dataset.tz;
  const ny = Temporal.PlainDateTime.from({ ...target, hour: 0 }).toZonedDateTime(tz);
  let sunrise = null;
  const lat = Number(tr.dataset.lat), lng = Number(tr.dataset.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const r = sunTimes(Temporal.PlainDate.from(target), lat, lng, tz);
    sunrise = r.rise;
    tr.querySelector(".ny-sunrise").textContent =
      r.polar === "night" ? "極夜" : r.polar === "day" ? "白夜"
        : r.rise ? fmtHM(r.rise) : "-";
  }
  return {
    nyEpoch: ny.epochMilliseconds,
    srEpoch: sunrise ? sunrise.epochMilliseconds : null,
    countEl: tr.querySelector(".ny-count"),
    sunEl: tr.querySelector(".ny-suncount"),
  };
});

function span(ms) {
  if (ms <= 0) return "0";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (d ? `${d}日` : "") + `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}

everySecond(() => {
  const now = Date.now();
  for (const r of rows) {
    r.countEl.textContent = span(r.nyEpoch - now);
    if (r.srEpoch != null) r.sunEl.textContent = span(r.srEpoch - now);
  }
});
