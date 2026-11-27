// Breakable parts per monster with their number of break stages, from the monster pages saved in
// tools/cache/breaks/m*.html ("破壊可能な部位" then e.g. "角（2段階）、尻尾、背中").
// Run: node tools/make_breaks.mjs -> data/breaks.json {monster: [[part, stages], ...]}
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const dir = new URL("cache/breaks/", import.meta.url);
const names = new Set(JSON.parse(readFileSync(new URL("../data/monsters.json", import.meta.url), "utf8")).map((m) => m.name));
const out = {};
for (const f of readdirSync(dir).filter((x) => /^m\d+\.html$/.test(x))) {
  const h = readFileSync(new URL(f, dir), "utf8");
  const name = (h.match(/<title>(.+?)の弱点/) || [])[1]?.replace(/[(（][^)）]*[)）]/g, "").trim(); // "鏖魔(おうま)ディアブロス(二つ名)" -> our name
  if (!name || !names.has(name)) continue;
  const t = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "\n").replace(/\n\s*\n+/g, "\n");
  const line = (t.match(/破壊可能な部位\n([^\n]+)/) || [])[1]?.trim();
  if (!line || line === "なし" || line === "-") continue;
  out[name] = line.split(/[、,，]/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^(.+?)[（(](\d+)段階[)）]$/);
    return m ? [m[1], +m[2]] : [p.replace(/[（(].*$/, ""), 1];
  });
}
writeFileSync(new URL("../data/breaks.json", import.meta.url), JSON.stringify(out) + "\n");
const multi = Object.entries(out).flatMap(([m, ps]) => ps.filter(([, s]) => s > 1).map(([p, s]) => `${m}:${p}${s}`));
console.log(`monsters ${Object.keys(out).length}, multi-stage parts ${multi.length}: ${multi.join(" ")}`);
