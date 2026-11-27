// Quest client (依頼主) per quest id, from the cached quest pages (tools/cache/raw/quest/*.html).
// Run: node tools/make_clients.mjs   -> data/clients.json  {questId: "依頼主"}
// The page title is "【村★３】名前 | ..." and the first paragraph is "依頼主: 本文".
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const quests = JSON.parse(readFileSync(new URL("data/quests.json", root), "utf8"));
const dir = new URL("tools/cache/raw/quest/", root);
const N = (s) => s.normalize("NFKC").replace(/\s/g, "");
const VENDOR = { 村: "村", 集: "集会所", 特殊許可: "特殊許可", 闘技大会: "闘技大会", 訓練: "訓練" };

const byKey = new Map(); // vendor|name -> quests (data order)
for (const q of quests) { const k = `${q.vendor}|${N(q.name)}`; (byKey.get(k) || byKey.set(k, []).get(k)).push(q); }

const out = {};
const miss = [];
for (const f of readdirSync(dir)) {
  const h = readFileSync(new URL(f, dir), "utf8");
  const title = (h.match(/<title>([^<]+)<\/title>/) || [])[1] || "";
  const m = title.match(/^【([^】]+)】(?:【特殊許可】)?(.+?)\s*\|/);
  const p = (h.slice(h.indexOf("<h2")).match(/<p>([^<]*)<\/p>/) || [])[1] || "";
  const client = (p.match(/^(.+?): /) || [])[1];
  if (!m || !client) { miss.push(`${f}: ${title.slice(0, 40)}`); continue; }
  const [, tag, name] = m;
  const vendor = VENDOR[tag.match(/^(村|集|特殊許可|闘技大会|訓練)/)?.[1]];
  const star = N(tag).match(/(G★\d+|★\d+)/)?.[1];
  let cands = byKey.get(`${vendor}|${N(name)}`) || byKey.get(`${vendor}|${N("【特殊許可】" + name)}`) || [];
  if (cands.length > 1 && star) { const f2 = cands.filter((q) => N(q.tab) === star); if (f2.length) cands = f2; }
  const q = cands.find((x) => !out[x.id]) || cands[0];
  if (!q) { miss.push(`${f}: ${title.slice(0, 40)}`); continue; }
  out[q.id] = client.trim();
}
writeFileSync(new URL("data/clients.json", root), JSON.stringify(out) + "\n");
console.log(`clients for ${Object.keys(out).length}/${quests.length} quests; not matched: ${miss.length}`);
if (miss.length) console.log(miss.slice(0, 20).join("\n"));
