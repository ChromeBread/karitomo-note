// Fill missing monster habitats in data/monnotes.json from the saved monster pages
// (tools/cache/breaks/m*.html: "出現場所 氷海（1,2[初],3[初],5[休],6,7,9）、雪山（…）").
// [初] = start area, [休] = rest (sleep) area; that source has no separate "moves through" list, so every
// listed area counts as a move area. Monsters that already have a habitat are left as they are.
// Run: node tools/make_habitat.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const notesUrl = new URL("../data/monnotes.json", import.meta.url);
const notes = JSON.parse(readFileSync(notesUrl, "utf8"));
const names = new Set(JSON.parse(readFileSync(new URL("../data/monsters.json", import.meta.url), "utf8")).map((m) => m.name));
const maps = new Set(JSON.parse(readFileSync(new URL("../data/maps.json", import.meta.url), "utf8")).map((m) => m.name));
const dir = new URL("cache/breaks/", import.meta.url);
const flat = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const added = [], unknownMaps = new Set();
for (const f of readdirSync(dir).filter((x) => /^m\d+\.html$/.test(x))) {
  const h = readFileSync(new URL(f, dir), "utf8");
  const name = (h.match(/<title>(.+?)の弱点/) || [])[1]?.replace(/[(（][^)）]*[)）]/g, "").trim();
  if (!name || !names.has(name) || notes.mons[name]?.habitat) continue;
  const where = (flat(h).match(/出現場所 (.*?) 弱点/) || [])[1];
  if (!where) continue;
  const hab = {};
  for (const part of where.split("、")) {
    const m = part.match(/^([^（(]+)(?:[（(](.*)[)）])?$/);
    if (!m) continue;
    const map = m[1].trim();
    if (!maps.has(map)) { unknownMaps.add(map); continue; }
    const h1 = { start: [], move: [], rest: [] };
    for (const a of (m[2] || "").split(",")) {
      const no = parseInt(a, 10);
      if (!Number.isInteger(no)) continue;
      if (!h1.move.includes(no)) h1.move.push(no);
      if (/初/.test(a) && !h1.start.includes(no)) h1.start.push(no);
      if (/休/.test(a) && !h1.rest.includes(no)) h1.rest.push(no);
    }
    hab[map] = h1;
  }
  if (!Object.keys(hab).length) continue;
  (notes.mons[name] ||= {}).habitat = hab;
  added.push(name);
}
writeFileSync(notesUrl, JSON.stringify(notes, null, 1));
console.log(`added ${added.length}: ${added.join(" ")}`);
if (unknownMaps.size) console.log(`maps not in maps.json: ${[...unknownMaps].join(" ")}`);
