// Language of the app: "gu" = English with the Switch version's names, "xx" = Japanese.
// Chosen in Settings; switching saves and reloads the page so no screen keeps old labels.
// Japanese text is the key: t("進行") gives the English UI text, nm("回復薬") the English game name;
// anything without a translation stays as it is.
export let LANG = "xx";
let ui = {}, names = {}, namesN = {};
export function setLang(lang, uiStrings = {}, gameNames = {}) {
  LANG = lang === "gu" ? "gu" : "xx";
  ui = uiStrings; names = gameNames; patterns = null;
  // the same names written with other character forms (調合書１ / 調合書①, full-width letters)
  namesN = {}; for (const [k, v] of Object.entries(names)) namesN[k.normalize("NFKC")] ??= v;
  document.documentElement.lang = LANG === "gu" ? "en" : "ja";
}
export const isEn = () => LANG === "gu";
export const t = (ja) => (LANG === "gu" && ui[ja]) || ja;
export const nm = (ja) => (LANG === "gu" && names[ja]) || ja;
// With values: tf("{n}件", {n: 3}) -> "3 items" (the {name} marks stay in both languages)
export const tf = (ja, v = {}) => t(ja).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

// GU mode: translate what is already on screen. Text nodes and a few attributes whose whole text is a
// Japanese UI string (or a game name) get the English one; keys with {n} (a number) or {s} (any text)
// match text with values inside. Elements marked lang="ja" (the Japanese official name over an English
// one) are left alone. Text without Japanese is skipped quickly.
const JP = /[ぁ-んァ-ヶ一-龯ー々〜・「」（）！？、。]/;
let patterns = null;
function compile() {
  // longer keys first, so "…／{n}位との差 +{s}" wins over its shorter start
  patterns = Object.keys(ui).filter((k) => k.includes("{")).sort((a, b) => b.length - a.length).map((k) => {
    // split on the {n} / {s} marks, escape the plain parts, join with capture groups
    const parts = k.split(/\{(n|s)\}/);
    let src = "";
    const kinds = parts.filter((_, i) => i % 2);
    // numbers may be full-width (★６)
    parts.forEach((p, i) => { src += i % 2 ? (p === "n" ? "([-+]?[0-9０-９][0-9０-９,.]*)" : "(.+?)") : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
    return { re: new RegExp(`^${src}$`), en: ui[k], kinds };
  });
}
export function trText(s) {
  const core = s.trim();
  if (!core || !JP.test(core)) return s;
  // ammo / coating names appear as "LV1通常弾" or "通常弾 LV1"; the name table has "LV1 通常弾"
  const a = core.match(/^LV(\d)\s*(\S.*)$/), b = core.match(/^(\S.*?)\s*LV(\d)$/);
  const lv = a ? [a[0], a[1], a[2]] : b ? [b[0], b[2], b[1]] : null;
  let out = ui[core] || names[core] || namesN[core.normalize("NFKC")] || (lv && names[`LV${lv[1]} ${lv[2]}`]);
  // "A / B / C" (myset pieces): each part on its own (names without an English form stay as they are)
  if (!out && core.includes(" / ")) {
    const parts = core.split(" / "), done = parts.map((x) => trText(x));
    if (done.some((x, i) => x !== parts[i])) out = done.join(" / ");
  }
  if (!out) {
    if (!patterns) compile();
    for (const p of patterns) {
      const m = p.re.exec(core);
      if (!m) continue;
      // values by kind, in the Japanese order; the English text may put them in another order
      const vals = { n: [], s: [] };
      p.kinds.forEach((k, i) => vals[k].push(m[i + 1]));
      const res = p.en.replace(/\{(n|s)\}/g, (_, k) => { const v = vals[k].shift() ?? ""; return k === "s" ? trList(v) : v.normalize("NFKC"); });
      // a pattern that is only marks ("{s} ({s})") counts only when everything inside got translated
      if (!/[A-Za-z]/.test(p.en.replace(/\{(n|s)\}/g, "")) && JP.test(res)) continue;
      out = res;
      break;
    }
  }
  return out ? s.replace(core, out) : s;
}
// a value inside a pattern: "A、B、C" lists are split only when every part has a translation
function trList(v) {
  if (!v.includes("、")) return trText(v);
  const parts = v.split("、"), done = parts.map((x) => trText(x));
  return done.every((x, i) => x !== parts[i] || !JP.test(x)) ? done.join(", ") : trText(v);
}
const ATTRS = ["placeholder", "title", "aria-label"];
export function translateDom(root) {
  if (LANG !== "gu" || !root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest('[lang="ja"], textarea, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  for (let n = w.nextNode(); n; n = w.nextNode()) { const v = trText(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
  const els = root.querySelectorAll ? root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(",")) : [];
  for (const el of [root, ...els]) for (const a of ATTRS) { const v = el.getAttribute?.(a); if (v) { const t2 = trText(v); if (t2 !== v) el.setAttribute(a, t2); } }
}
// keep translating what scripts add later (search results, toasts, the tour)
export function watchDom(root) {
  if (LANG !== "gu") return;
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") { const v = trText(m.target.nodeValue); if (v !== m.target.nodeValue) m.target.nodeValue = v; }
      else for (const n of m.addedNodes) n.nodeType === 3 ? (n.nodeValue = trText(n.nodeValue)) : translateDom(n);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}
