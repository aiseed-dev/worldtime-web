// 都市検索(クライアント完結)。public/data/search.json を1回だけ読み込む。
const input = document.getElementById("q");
const out = document.getElementById("results");
let rows = null; // [表示名, ふりがな, 国名, id]

const kata2hira = (s) =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

async function load() {
  if (!rows) {
    const res = await fetch("/data/search.json");
    rows = (await res.json()).map((r) => [
      ...r,
      kata2hira(r[0].toLowerCase()),  // 都市名(ひらがな化)
      kata2hira(r[2].toLowerCase()),  // 国名(ひらがな化)
    ]);
  }
  return rows;
}

function render(list) {
  if (!list.length) {
    out.innerHTML = "<p>該当する都市が見つかりませんでした。</p>";
    return;
  }
  out.innerHTML = "<ul>" + list.slice(0, 50).map(
    ([name, , country, id]) =>
      `<li><a href="/WorldTime/Location/${id}">${name}</a> <span class="muted">${country}</span></li>`,
  ).join("") + "</ul>";
}

async function onInput() {
  const q = kata2hira(input.value.trim().toLowerCase());
  if (q.length === 0) {
    out.innerHTML = "";
    return;
  }
  const data = await load();
  render(data.filter(([name, kana, country, id, normName, normCountry]) =>
    normName.includes(q)
    || kana.includes(q)
    || normCountry.includes(q)
    || id.toLowerCase().includes(q)));
}

input.addEventListener("input", onInput);
input.focus();
