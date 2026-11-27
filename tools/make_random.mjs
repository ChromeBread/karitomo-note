// Quests that appear at random (キリン / 古龍 / バルファルク …), from the saved quest-condition pages
// (tools/cache/questcond/*.html). A quest counts when its own block says so (出現条件 "…ランダム出現" not in a
// "※" note about other quests, or 備考 "ランダム出現"), or when a note names it as random
// (「雷電、白き霊獣はランダム出現」, 「ランダムに出現するキリンのクエスト「美しき幻獣」と…」).
// Run: node tools/make_random.mjs -> data/randomq.json [quest id, ...]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const Q = JSON.parse(readFileSync(new URL("../data/quests.json", import.meta.url), "utf8"));
const N = (x) => x.normalize("NFKC").replace(/[\s・･、。!?！？…‥.~～ー-]/g, "");
const dir = new URL("cache/questcond/", import.meta.url);
const flat = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const tabOf = (v, star) => (v === "村" ? `★${star}` : v === "G級" ? `Ｇ★${star}` : `★${star}`).normalize("NFKC");
const out = new Set(), named = new Set(), miss = [];
const find = (name, vendor, tab) => {
  // okurigana differs between sources (現れし / 現われし): compare without kana after kanji as a fallback
  const loose = (t) => N(t).replace(/現われ/g, "現れ");
  let qs = Q.filter((q) => N(q.name) === N(name));
  if (!qs.length) qs = Q.filter((q) => loose(q.name) === loose(name));
  if (vendor) { const v = vendor === "村" ? "村" : "集会所"; if (qs.some((q) => q.vendor === v)) qs = qs.filter((q) => q.vendor === v); }
  if (tab) { const t = qs.filter((q) => q.tab.normalize("NFKC") === tab); if (t.length) qs = t; }
  return qs;
};
for (const f of readdirSync(dir).filter((x) => x.endsWith(".html"))) {
  const x = flat(readFileSync(new URL(f, dir), "utf8"));
  // quest blocks: "村★10 高難度：宵闇に消ゆ MAP： … 出現条件：… 備考：…"
  const re = /(村|集会所|G級)★(\d+) ([^★]{1,30}?) MAP[：:]/g;
  const heads = [...x.matchAll(re)];
  heads.forEach((m, k) => {
    const body = x.slice(m.index, heads[k + 1]?.index ?? x.length);
    const cond = (body.match(/出現条件[：:](.*?)(?:受注条件|備考|【クエスト報酬|$)/) || [])[1] || "";
    const own = cond.split("※")[0];
    const note = (body.match(/備考[：:](.*?)(?:【クエスト報酬|$)/) || [])[1] || "";
    if (/ランダム/.test(own) || /ランダム出現/.test(note)) {
      const qs = find(m[3], m[1], tabOf(m[1], m[2]));
      if (qs.length) qs.forEach((q) => out.add(q.id)); else miss.push(m[3]);
    }
    // notes naming other random quests: "※ 雷電、白き霊獣はランダム出現"
    for (const n of cond.matchAll(/※\s*([^※]+?)はランダム出現/g)) for (const nm of n[1].split(/[、,]/)) named.add(nm.trim());
  });
  for (const n of x.matchAll(/ランダムに出現する[^「]{0,20}クエスト((?:「[^」]+」[とや、]?)+)/g)) for (const nm of n[1].matchAll(/「([^」]+)」/g)) named.add(nm[1]);
}
for (const nm of named) { const qs = find(nm); if (qs.length) qs.forEach((q) => out.add(q.id)); else miss.push(nm); }
writeFileSync(new URL("../data/randomq.json", import.meta.url), JSON.stringify([...out]) + "\n");
console.log(`random quests: ${out.size}`, [...out].map((id) => { const q = Q.find((x) => x.id === id); return `${q.vendor}${q.tab}「${q.name}」`; }).join(" "));
if (miss.length) console.log("not found:", miss.join(" / "));
