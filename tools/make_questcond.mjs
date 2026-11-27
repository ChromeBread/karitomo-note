// Quest appearance conditions (出現条件) per quest id, from the per-tab quest pages saved in
// tools/cache/questcond/*.html (one <dt>"村★3 名前 MAP：…"</dt> + "出現条件：…" per quest).
// Run: node tools/make_questcond.mjs -> data/questcond.json {questId: "条件の文"}
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const quests = JSON.parse(readFileSync(new URL("data/quests.json", root), "utf8"));
const dir = new URL("tools/cache/questcond/", root);
// names compared without spaces and punctuation (the pages write 、・… ～ differently)
const N = (s) => s.normalize("NFKC").replace(/[\s・･、。!?！？…‥.~～ー-]/g, "");
const strip = (h) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const byKey = new Map(); // vendor|N(name) -> quests (data order)
for (const q of quests) { const k = `${q.vendor}|${N(q.name)}`; (byKey.get(k) || byKey.set(k, []).get(k)).push(q); }

const out = {}, miss = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith(".html"))) {
  const h = readFileSync(new URL(f, dir), "utf8");
  for (const part of h.split(/<dt>/).slice(1)) {
    const dt = strip(part.slice(0, part.indexOf("</dt>"))).replace(/\s*MAP：.*$/, "");
    const cond = (part.match(/出現条件：([\s\S]*?)<\/p>/) || [])[1];
    if (!cond) continue;
    // "村★3 名前" / "集会所★5 名前" / "G級★4 名前" / "【特殊許可】名前" / "下位 名前"(闘技大会)
    let m, vendor, tab = null, name;
    if ((m = dt.match(/^村★(\d+)\s+(.+)$/))) [vendor, tab, name] = ["村", `★${m[1]}`, m[2]];
    else if ((m = dt.match(/^(?:集会所)?G級★(\d+)\s+(.+)$/))) [vendor, tab, name] = ["集会所", `G★${m[1]}`, m[2]];
    else if ((m = dt.match(/^集会所★(\d+)\s+(.+)$/))) [vendor, tab, name] = ["集会所", `★${m[1]}`, m[2]];
    else if (dt.startsWith("【特殊許可】")) [vendor, name] = ["特殊許可", dt];
    else if ((m = dt.match(/^(?:下位|上位|G級)\s+(.+)$/))) [vendor, name] = ["闘技大会", m[1]];
    else { miss.push(dt); continue; }
    let cands = byKey.get(`${vendor}|${N(name)}`) || [];
    if (tab && cands.length > 1) { const t = cands.filter((q) => N(q.tab) === N(tab)); if (t.length) cands = t; }
    if (!cands.length) { miss.push(dt); continue; }
    for (const q of cands) out[q.id] ||= strip(cond);
  }
}
writeFileSync(new URL("data/questcond.json", root), JSON.stringify(out) + "\n");
console.log(`conditions for ${Object.keys(out).length} quests; not matched: ${miss.length}`);
if (miss.length) console.log(miss.slice(0, 30).join("\n"));
