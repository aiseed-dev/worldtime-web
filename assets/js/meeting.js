// 会議時間計算: 複数都市の時刻対応表(Temporal でクライアント完結)
import { ready, pad2, wday, zoneAbbr, offsetString } from "/assets/js/timej.js";

await ready;

const form = document.getElementById("meetingform");
const out = document.getElementById("meetingout");
const DEFAULTS = ["Asia/Tokyo", "America/New_York", "Europe/London", ""];

let cities = []; // [名前, ふりがな, 国名, id] — 検索と同じデータ
const tzOf = new Map(); // id → tz は search.json に無いので locations 由来の meeting.json を使う

async function init() {
  const res = await fetch("/data/meeting.json"); // [[名前, id, tz], ...]
  cities = await res.json();

  const now = Temporal.Now.zonedDateTimeISO("Asia/Tokyo");
  const opts = (el, from, to, sel) => {
    for (let i = from; i <= to; i++) el.add(new Option(i, i, false, i === sel));
  };
  opts(form.querySelector(".f-year"), now.year - 1, now.year + 2, now.year);
  opts(form.querySelector(".f-month"), 1, 12, now.month);
  opts(form.querySelector(".f-day"), 1, 31, now.day);

  for (const sel of form.querySelectorAll(".m-city")) {
    sel.add(new Option("(選択してください)", ""));
    const def = DEFAULTS[Number(sel.dataset.slot)];
    for (const [name, id, tz] of cities) {
      tzOf.set(id, tz);
      sel.add(new Option(name, id, false, id === def));
    }
  }
  for (const sel of form.querySelectorAll("select")) sel.addEventListener("change", render);
  render();
}

function render() {
  const y = Number(form.querySelector(".f-year").value);
  const m = Number(form.querySelector(".f-month").value);
  const d = Number(form.querySelector(".f-day").value);
  const picked = [...form.querySelectorAll(".m-city")]
    .map((s) => s.value).filter(Boolean);
  if (picked.length < 2) {
    out.innerHTML = '<p class="muted">都市を2つ以上選んでください。</p>';
    return;
  }
  let base;
  try {
    base = Temporal.PlainDateTime.from(
      { year: y, month: m, day: d, hour: 0, overflow: "reject" })
      .toZonedDateTime(tzOf.get(picked[0]), { disambiguation: "compatible" });
  } catch {
    out.innerHTML = "<p>日付が正しくありません。</p>";
    return;
  }

  const names = new Map(cities.map(([name, id]) => [id, name]));
  let html = '<div class="scroll-x"><table class="wtable meeting"><thead><tr>';
  for (const id of picked) {
    const z = Temporal.Now.zonedDateTimeISO(tzOf.get(id));
    html += `<th>${names.get(id)}<br><span class="muted">UTC${offsetString(z.offsetNanoseconds)}</span></th>`;
  }
  html += "</tr></thead><tbody>";
  for (let h = 0; h < 24; h++) {
    const t0 = base.add({ hours: h });
    html += "<tr>";
    for (const id of picked) {
      const t = t0.withTimeZone(tzOf.get(id));
      const work = t.hour >= 9 && t.hour < 18;
      const dayDiff = Temporal.PlainDate.compare(t.toPlainDate(), t0.toPlainDate());
      const mark = dayDiff > 0 ? " <small>翌日</small>" : dayDiff < 0 ? " <small>前日</small>" : "";
      html += `<td${work ? ' class="working"' : ""}>${pad2(t.hour)}:${pad2(t.minute)}${mark}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table></div>";
  html += `<p class="muted">${base.month}月${base.day}日(${wday(base)})の${names.get(picked[0])}の0時から24時間分を表示しています。色付きは業務時間(9時〜18時)です。</p>`;
  out.innerHTML = html;
}

init();
