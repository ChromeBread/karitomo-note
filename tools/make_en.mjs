// English names for the GU (English) mode, from the English list pages saved in tools/cache/en/*.html
// (every name there is written as <ruby>日本語<rt>English</rt></ruby>), the English map pages in
// tools/cache/en_map (page title) and the skill effect descriptions on the English skill page.
// Run: node tools/make_en.mjs -> data/en.json {names: {日本語: English}, effectDesc: {効果名: English text}, maps: {id: English}, quests: {id: English}}
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const root = new URL("../", import.meta.url);
const dir = (d) => new URL(`tools/cache/${d}/`, root);
const unesc = (s) => s.replace(/&#039;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const names = {}, effectDesc = {}, maps = {}, clash = new Set();
// list pages, plus the detail pages in en/buki (weapon upgrade names) and en/quest (quests the lists miss)
const files = readdirSync(dir("en"), { recursive: true }).filter((f) => f.endsWith(".html")).map((f) => f.split("\\").join("/"));
const quests = {};
for (const f of files) {
  const t = readFileSync(new URL(f, dir("en")), "utf8");
  if (f.startsWith("quest/")) { const m = t.match(/<title>\s*([^|<]+?)\s*\|/); if (m) quests[f.slice(6, -5)] = unesc(m[1]); }
  for (const [, ja, en] of t.matchAll(/<ruby>([^<]+)<rt>([^<]*)<\/rt><\/ruby>/g)) {
    const j = unesc(ja), e = unesc(en);
    if (!e || j === e || /[ぁ-んァ-ヶ一-龯【]/.test(e)) continue; // some "English" texts are still Japanese
    if (names[j] && names[j] !== e) clash.add(j); // same Japanese name, two English names: keep the first
    else names[j] ??= e;
  }
  if (f === "skill.html") {
    const flat = t.replace(/\n/g, "");
    for (const [, ja, desc] of flat.matchAll(/<tr><td class="vertical-align"><ruby>([^<]+)<rt>[^<]*<\/rt><\/ruby><\/td><td[^>]*>.*?<\/td><td class="vertical-align">([^<]*)<\/td><\/tr>/g)) effectDesc[unesc(ja)] = unesc(desc);
  }
}
for (const f of readdirSync(dir("en_map"))) {
  const m = readFileSync(new URL(f, dir("en_map")), "utf8").match(/<title>\s*([^|<]+?)\s*\|/);
  if (m) maps[f.replace(/\.html$/, "")] = unesc(m[1]);
}
// the map pages abbreviate long names ("C. Schrade"); full names by map id, hand-written
const FULL = { "50b65": "Floating Slayground", "53375": "Castle Schrade", "53675": "Frozen Seaway", "540d5": "Primal Forest", "548d5": "Ruined Pinnacle",
  "56485": "Vertical Slayground", "57db5": "Sacred Pinnacle", "586e5": "Forlorn Citadel", "596e5": "Volcanic Hollow", "5a035": "Polar Zone",
  "5edd5": "Ancestral Steppe", "75065": "Misty Peaks", "759e5": "Jurassic Frontier", "854d5": "Verdant Hills", "a5375": "Arctic Ridge", "d5d85": "Deserted Island" };
Object.assign(maps, FULL);
// quest goals from the English quest lists (tools/cache/en_quest): after the quest name come the main goal,
// its HRP, then the sub goal and its HRP when there is one
const goals = {};
for (const f of readdirSync(dir("en_quest"))) {
  const flat = readFileSync(new URL(f, dir("en_quest")), "utf8").replace(/\n/g, "");
  for (const part of flat.split('href="/en/quest/').slice(1)) {
    const id = part.match(/^([0-9a-f]+)"/)?.[1];
    const tok = part.replace(/^[^>]*>/, "").replace(/<[^>]+>/g, "|").split("|").map((x) => unesc(x)).filter(Boolean);
    if (!id || tok.length < 3 || /[ぁ-んァ-ヶ一-龯]/.test(tok[1])) continue; // some rows show only a Japanese name there
    const hrp = (x) => /^\d+HRP$/.test(x || "");
    goals[id] = { goal: tok[1], ...(hrp(tok[2]) && hrp(tok[4]) ? { sub: tok[3] } : {}) };
  }
}
// Names marked "⚠" above are the source's unconfirmed translations. The Switch version's own list pages
// (tools/cache/gu/*.html, same ids and order as the Japanese pages) carry the official names, so they win.
const gu = (f) => { try { return readFileSync(new URL(f, dir("gu")), "utf8"); } catch { return ""; } };
const links = (html, kind) => [...html.matchAll(new RegExp(`href="/${kind}/([0-9a-f]+)"[^>]*>([^<]+)<`, "g"))].map(([, id, n]) => [id, unesc(n)]);
const jaLinks = (f, kind) => { try { return links(readFileSync(new URL(f, dir("raw")), "utf8"), kind); } catch { return []; } };
const official = {};
const byId = (jaById, html, kind) => { for (const [id, en] of links(html, kind)) if (jaById[id]) official[jaById[id]] = en; };
const ours = (n) => JSON.parse(readFileSync(new URL(`data/${n}.json`, root), "utf8"));
byId(ours("items"), gu("item.html"), "item");
byId(Object.fromEntries(ours("monsters").map((m) => [m.id, m.name])), gu("monster.html"), "monster");
byId(Object.fromEntries(ours("decos").map((d) => [d.id, d.name])), gu("decorations.html"), "item");
// skills: tree name by id, effects matched by their points inside the tree
const skillHtml = gu("skill.html").replace(/\s+/g, " ");
for (const tree of ours("skills")) {
  const part = skillHtml.split(`href="/skill/${tree.id}">`)[1];
  if (!part) continue;
  official[tree.name] = unesc(part.split("<")[0]);
  const block = part.split(/href="\/skill\//)[0];
  for (const [, en, pts, desc] of block.matchAll(/<td class="vertical-align">\s*([^<]+?)\s*<\/td>\s*<td class="text-center vertical-align">([+-]?\d+)<\/span><\/td>\s*<td class="vertical-align">([^<]*)<\/td>/g)) {
    const e = tree.effects.find((x) => x.pts === +pts);
    if (e) { official[e.name] = unesc(en); effectDesc[e.name] = unesc(desc); }
  }
}
// armor and weapons: same order as the Japanese list pages
// paired per id (one id = a series or lineage with several names in the same order); pages can differ in length
// because the Japanese pages also list gear that only came out in Japan
const zip = (jaFile, jaKind, guFile, guKind) => {
  const group = (list) => { const g = {}; for (const [id, n] of list) (g[id] ||= []).includes(n) || g[id].push(n); return g; };
  const a = group(jaLinks(jaFile, jaKind)), b = group(links(gu(guFile), guKind));
  for (const [id, jas] of Object.entries(a)) if (b[id]?.length === jas.length) jas.forEach((ja, i) => (official[ja] = b[id][i]));
};
for (let r = 1; r <= 11; r++) zip(`bougu_rare_${r}.html`, "bougu", `armor_rare_${r}.html`, "armor");
const W = { dai: "greatsword", tachi: "longsword", kata: "sword", sou: "dualblades", ham: "hammer", fue: "huntinghorn", lan: "lance", gun: "gunlance", saxe: "switchaxe", caxe: "chargeblade", rod: "insectglaive", lbg: "lightbowgun", hbg: "heavybowgun", yumi: "bow" };
for (const [ja, en] of Object.entries(W)) zip(`${ja}.html`, "buki", `${en}.html`, "weapon");
// detail pages of the Switch version (tools/fetch_gu.mjs): weapon lineages ("Name LV3" rows give each level's name),
// quests ("<h2>…</h2><p>Client: text") and the quest-reward armor pieces (page title)
const guDetail = (d) => { try { return readdirSync(new URL(`${d}/`, dir("gu"))).filter((f) => f.endsWith(".html")); } catch { return []; } };
const byLineage = {};
for (const w of ours("weapons")) (byLineage[w.id] ||= []).push(w);
for (const f of guDetail("weapon")) {
  const id = f.slice(0, -5), text = readFileSync(new URL(`weapon/${f}`, dir("gu")), "utf8").replace(/<[^>]+>/g, "|").replace(/\s+/g, " ");
  const lv = {};
  for (const [, n, l] of text.matchAll(/\|\s*([^|]+?) LV(\d+)\s*\|/g)) lv[l] ??= unesc(n);
  for (const w of byLineage[id] || []) { const n = lv[w.levels[0]?.lv]; if (n) official[w.name] = n; }
}
const clientsJa = ours("clients");
for (const f of guDetail("quest")) {
  const id = f.slice(0, -5), m = readFileSync(new URL(`quest/${f}`, dir("gu")), "utf8").match(/<h2>[^<]*<\/h2>\s*<p>([^:<]{1,60}):/);
  if (m && clientsJa[id]) official[clientsJa[id]] ??= unesc(m[1]);
}
for (const f of guDetail("armor")) {
  const title = (file) => { try { return readFileSync(file, "utf8").match(/<title>\s*([^|<]+?)\s*[|-]/)?.[1]; } catch { return null; } };
  const ja = title(new URL(`bougu/${f}`, dir("raw"))), en = title(new URL(`armor/${f}`, dir("gu")));
  if (ja && en) official[unesc(ja)] = unesc(en);
}
const before = Object.values(names).filter((v) => v.includes("⚠")).length;
Object.assign(names, official);
for (const [k, v] of Object.entries(names)) if (v.includes("⚠")) names[k] = v.replace(/\s*⚠\s*/g, "").trim(); // keep, without the mark
console.log(`official names ${Object.keys(official).length}; marked unconfirmed before ${before}`);

// the Switch version's own quest list (tools/cache/gu/quest.html, same quest ids): English names for every quest it
// has; quests of ours missing from it were only given out in Japan (jpOnly)
const ourQuests = ours("quests");
let jpOnly = [];
try {
  const guQ = {};
  for (const [, id, name] of readFileSync(new URL("tools/cache/gu/quest.html", root), "utf8").matchAll(/href="\/quest\/([0-9a-f]+)"[^>]*>([^<]+)</g)) guQ[id] ??= unesc(name).replace(/^【[^】]*】\s*/, ""); // link text starts with "【Village★１】"
  for (const q of ourQuests) if (guQ[q.id]) quests[q.id] = guQ[q.id];
  jpOnly = ourQuests.filter((q) => !guQ[q.id]).map((q) => q.id);
  for (const id of jpOnly) delete quests[id]; // no English name exists (the detail page title is Japanese)
} catch { /* list not saved: keep what the detail pages gave */ }
// game texts by their Japanese text (texts): Hunter Art descriptions from the Switch version's Hunter Arts list
// ("name | 250pts | 500pts SP | description"), matched to data/huntarts.json through the English art names
const texts = {};
{
  const tok = gu("hunterarts.html").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "|").split("|").map((x) => unesc(x.replace(/\s+/g, " "))).filter(Boolean);
  const arts = [];
  tok.forEach((x, i) => { if (/^\d+pts$/.test(x)) arts.push({ name: tok[i - 1], desc: tok.slice(i + 1, i + 4).find((y) => y.length > 12) }); });
  for (const a of ours("huntarts")) {
    const hit = arts.find((g) => !g.used && g.name === names[a.name]);
    if (hit?.desc) { hit.used = true; texts[a.desc] = hit.desc; }
  }
}
// meals (data/meals.json): food skills and dishes in the same order as the Switch version's Food Skills and Meal List
// pages ("name | description" pairs; dishes are the rows before "Hunter"); used only when the counts agree
{
  const tk = (f) => gu(f).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "|").split("|").map((x) => unesc(x.replace(/\s+/g, " "))).filter(Boolean);
  const meals = ours("meals");
  const fs1 = tk("food-skills.html"), start = fs1.lastIndexOf("Veggie Elder") + 1;
  const skills = [];
  for (let i = start; i + 1 < fs1.length && skills.length < meals.skills.length; i += 2) skills.push([fs1[i], fs1[i + 1]]);
  if (skills.length === meals.skills.length) meals.skills.forEach((s, i) => { names[s.name] = skills[i][0]; texts[s.desc] = skills[i][1]; });
  const ml = tk("meals.html"), dishes = ml.filter((x, i) => ml[i + 1] === "Hunter");
  if (dishes.length === meals.dishes.length) meals.dishes.forEach((d, i) => (names[d.name] = dishes[i]));
  console.log(`meals: skills ${skills.length}/${meals.skills.length}, dishes ${dishes.length}/${meals.dishes.length}`);
}
// Prowler support moves: data/nyanter.json (our order) -> the Switch version's names, matched by hand
// (gauge costs agree); descriptions come from its Palico Support page ("name | gauge | description")
{
  const EN = ["Claw Dance", "Felyne Comet", "Sumo Stomp", "Mega Boomerang", "Chestnut Cannon", "Excavator", "Shock Tripper", "Stunt Cannon", "Burrowing Blow", "Iron Transpurrter",
    "True Health Horn", "Herb Horn", "Health Horn", "Emergency Retreat", "Detox Horn", "Vase of Vitality", "Parting Gift", "Soothing Roll", "Furbidden Acorn", "Furlask of Healing",
    "Big Boomerangs", "Piercing Boomerangs", "Furr-ious", "Taunt", "Release the Beast", "Rousing Roar", "Weapon Upgrade", "Palico Rally", "Camouflage", "Cheer Horn", "Demon Horn",
    "Armor Horn", "Dung Bombay", "Ultrasonic Horn", "Trampoliner", "Go, Fight, Win", "Far-cat-ster", "SP Horn", "Widewhiskers Horn",
    "Big Barrel Bombay", "Mega Barrel Bombay", "Giga Barrel Bombay", "Mini Barrel Bombay", "Barrel Bombay", "Bounce Bombay", "Flash Bombay", "Anti-Monster Mine", "Anti-Monster Mine+",
    "Explosive Roll", "Rath-of-Meow", "Explosive Transpurrter", "Pitfall Purr-ison", "Poison Purr-ison", "Shock Purr-ison", "Pilfer", "Plunderang"];
  const tok = gu("prowler-support.html").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "|").split("|").map((x) => unesc(x.replace(/\s+/g, " "))).filter(Boolean);
  const desc = {};
  tok.forEach((x, i) => { if (/^\d$/.test(tok[i + 1] || "") && tok[i + 2]?.length > 12) desc[x] ??= tok[i + 2]; });
  ours("nyanter").forEach((m, i) => { if (!EN[i]) return; official[m.name] = EN[i]; names[m.name] = EN[i]; if (desc[EN[i]] && m.effect) texts[m.effect] = desc[EN[i]]; });
}
// main / sub goals from the Switch version's quest pages ("|Main|Deliver 8 Unique Ferns|300z …|Sub|…|")
for (const f of guDetail("quest")) {
  const flat = readFileSync(new URL(`quest/${f}`, dir("gu")), "utf8").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "|").replace(/\s+/g, " ").replace(/(\| ?)+/g, "|");
  const main = flat.match(/\|Main\|([^|]+)\|/)?.[1], sub = flat.match(/\|Sub\|([^|]+)\|/)?.[1];
  if (main) goals[f.slice(0, -5)] = { goal: unesc(main), ...(sub && sub.trim() !== "None" ? { sub: unesc(sub) } : {}) };
}
writeFileSync(new URL("data/en.json", root), JSON.stringify({ names, effectDesc, maps, quests, goals, jpOnly, texts }) + "\n");
// small copy for both languages (the 仕様メモ lists them in Japanese too)
writeFileSync(new URL("data/jponly.json", root), JSON.stringify(jpOnly) + "\n");
console.log(`jpOnly ${jpOnly.length}, names ${Object.keys(names).length}, effect texts ${Object.keys(effectDesc).length}, maps ${Object.keys(maps).length}, quests ${Object.keys(quests).length}, names with two English forms ${clash.size}`);
