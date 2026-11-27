// ネコ飯: dishes (stats for hunter / palico) and meal skills (game text), from the cached pages
// tools/cache/raw/shokuji.html and shokuskill.html.  Run: node tools/make_meals.mjs -> data/meals.json
import { readFileSync, writeFileSync } from "node:fs";

const raw = (n) => readFileSync(new URL(`cache/raw/${n}.html`, import.meta.url), "utf8");
const text = (h) => h.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const num = (s) => (s === "-" || s === "" ? 0 : parseInt(s, 10));

// dishes: <td rowspan=3><div> name </div></td></tr> then a ハンター row and an オトモ row of 9 numbers
const dishes = [];
const dh = raw("shokuji");
const re = /<td rowspan="3"[^>]*><div>([^<]+)<\/div><\/td><\/tr>\s*<tr>([\s\S]*?)<\/tr>\s*<tr>([\s\S]*?)<\/tr>/g;
const cells = (row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
for (const m of dh.matchAll(re)) {
  const h = cells(m[2]), o = cells(m[3]);
  if (h[0] !== "ハンター" || o[0] !== "オトモ") continue;
  // columns: 体力, スタミナ(オトモはテンション), 攻撃, 防御, 火, 水, 雷, 氷, 龍
  dishes.push({ name: m[1].trim(), hunter: h.slice(1, 10).map(num), otomo: o.slice(1, 10).map(num) });
}

// meal skills: name | description rows
const skills = [];
const sh = raw("shokuskill");
const body = sh.slice(sh.lastIndexOf("山菜爺"));
for (const m of body.matchAll(/<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g)) {
  const name = text(m[1]), desc = text(m[2]).replace(/\s/g, "");
  if (name && desc && /ネコ|招き/.test(name)) skills.push({ name, desc });
}

writeFileSync(new URL("../data/meals.json", import.meta.url), JSON.stringify({ dishes, skills }) + "\n");
console.log(`dishes ${dishes.length}, skills ${skills.length}`);
