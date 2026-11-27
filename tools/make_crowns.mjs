// Crown sizes per large monster from the saved monster pages (tools/cache/raw/mon/*.html:
// "サイズ: 1,711.30 小冠: ≤1,659.96 銀冠: ≥2,002.22 金冠: ≥2,104.90").
// Run: node tools/make_crowns.mjs -> data/crowns.json {monster: [base, small max, silver min, gold min]}
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const dir = new URL("cache/raw/mon/", import.meta.url);
const names = new Set(JSON.parse(readFileSync(new URL("../data/monsters.json", import.meta.url), "utf8")).map((m) => m.name));
const num = (s) => (s ? +s.replace(/,/g, "") : null);
const out = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith(".html"))) {
  const h = readFileSync(new URL(f, dir), "utf8");
  const name = (h.match(/<title>(.+?) \|/) || [])[1]?.trim();
  if (!name || !names.has(name)) continue;
  const t = h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&le;/g, "≤").replace(/&ge;/g, "≥").replace(/\s+/g, " ");
  const g = (k) => num((t.match(new RegExp(`${k}: *[≤≥]? *([0-9,.]+)`)) || [])[1]);
  const v = [g("サイズ"), g("小冠"), g("銀冠"), g("金冠")];
  if (v[1] && v[2] && v[3]) out[name] = v;
}
writeFileSync(new URL("../data/crowns.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(`monsters with crown sizes: ${Object.keys(out).length}`);
