// Gathering spots per map area and rank, keeping each spot's own table (the flat list in data/maps.json
// merges them). From the cached map pages tools/cache/raw/map/*.html: in each area table a cell with
// rowspan starts a spot: "x3〜5" = how many times you can gather there; an optional "20%" above it means
// the spot uses this table 20% of the time (the next tables of the same spot add up to 100%).
// Run: node tools/make_gather.mjs -> data/gather.json {map: {area: {rank: [{n, tables: [{p, items: [[id, qty, pct]]}]}]}}}
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const dir = new URL("cache/raw/map/", import.meta.url);
const out = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith(".html"))) {
  const h = readFileSync(new URL(f, dir), "utf8");
  const map = (h.match(/<title>([^|<]+?)\s*\|/) || [])[1]?.trim();
  if (!map) continue;
  const areas = {};
  for (const ap of h.split(/<h4[^>]*>/).slice(1)) {
    const no = (ap.match(/^\s*エリア(\d+)/) || [])[1];
    if (no === undefined) continue;
    const ranks = {};
    for (const rp of ap.split(/<h5[^>]*>/).slice(1)) {
      const rank = (rp.match(/^\s*(下位|上位|G級)/) || [])[1];
      if (!rank) continue;
      const body = rp.slice(0, rp.indexOf("</table>"));
      const spots = [];
      for (const blk of body.split(/<td rowspan="\d+"[^>]*>/).slice(1)) {
        const head = blk.slice(0, blk.indexOf("</td>"));
        const divs = [...head.matchAll(/<div[^>]*>([^<]*)<\/div>/g)].map((m) => m[1].trim());
        const chance = parseInt(divs[0], 10) || 100;
        const n = (divs.find((d) => /x/.test(d)) || "").replace(/^x/, "").trim();
        const items = [...blk.matchAll(/<a href="\/item\/([0-9a-f]+)">[^<]*<\/a>\s*(?:x(\d+)\s*)?<\/td>\s*<td[^>]*>(\d+)%/g)].map((m) => [m[1], +(m[2] || 1), +m[3]]);
        const table = { p: chance, items };
        // a table with a chance < 100 joins the previous spot until the chances reach 100%
        const last = spots[spots.length - 1];
        if (last && last.open && chance < 100) { last.tables.push(table); last.sum += chance; last.open = last.sum < 100; }
        else spots.push({ n, tables: [table], sum: chance, open: chance < 100 });
      }
      ranks[rank] = spots.map(({ n, tables }) => ({ n, tables }));
    }
    areas[no] = ranks;
  }
  out[map] = areas;
}
writeFileSync(new URL("../data/gather.json", import.meta.url), JSON.stringify(out) + "\n");
const spots = Object.values(out).flatMap((a) => Object.values(a).flatMap((r) => Object.values(r).flat()));
console.log(`maps ${Object.keys(out).length}, spots ${spots.length}, with alternative tables ${spots.filter((s) => s.tables.length > 1).length}`);
