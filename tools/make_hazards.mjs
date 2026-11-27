// Roar / wind pressure / tremor size per large monster, for the 耳栓・風圧・耐震 skill notes.
// Two saved sources are compared: the monster pages in tools/cache/breaks/m*.html ("咆哮 大 風圧 小")
// and the trap pages in tools/cache/traps/*.html ("咆哮 风圧 振动 … 小 - -"), matched to our names
// through tools/cache/traps_report.txt. Run: node tools/make_hazards.mjs -> data/hazards.json
// {monster: {roar, wind, quake}}: "小" / "大" / "特大" / "龍" (wind) / "あり" (tremor) / "" (none);
// when the two sources disagree the value is [A, B] so the app can show both.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";

const cache = new URL("cache/", import.meta.url);
const names = new Set(JSON.parse(readFileSync(new URL("../data/monsters.json", import.meta.url), "utf8")).map((m) => m.name));
const flat = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const norm = (v) => (["小", "大", "特大", "龍"].includes(v) ? v : v === "○" || v === "◯" ? "あり" : /^(-|－|なし|无|×)?$/.test(v || "") ? "" : null);

// source A: Japanese monster pages
const A = {};
for (const f of readdirSync(new URL("breaks/", cache)).filter((x) => /^m\d+\.html$/.test(x))) {
  const h = readFileSync(new URL(`breaks/${f}`, cache), "utf8");
  const name = (h.match(/<title>(.+?)の弱点/) || [])[1]?.replace(/[(（][^)）]*[)）]/g, "").trim(); // "鏖魔(おうま)ディアブロス(二つ名)" -> our name
  if (!name || !names.has(name)) continue;
  const t = flat(h);
  const roar = norm((t.match(/咆哮 (\S+)/) || [])[1]), wind = norm((t.match(/風圧 (\S+)/) || [])[1]);
  A[name] = { roar, wind };
}
// source B: trap pages (Chinese names -> ours via the trap report written by fetch_traps.py merge)
const B = {};
const report = existsSync(new URL("traps_report.txt", cache)) ? readFileSync(new URL("traps_report.txt", cache), "utf8").split("--- unmatched")[0] : "";
const cn2jp = Object.fromEntries(report.split("\n").filter(Boolean).map((l) => l.split("\t")).map(([cn, jp]) => [cn, jp]));
for (const f of readdirSync(new URL("traps/", cache)).filter((x) => /^\d+\.html$/.test(x))) {
  const t = flat(readFileSync(new URL(`traps/${f}`, cache), "utf8"));
  const cn = (t.match(/怪物名 (\S+) 种类/) || [])[1];
  const jp = cn2jp[cn];
  const m = t.match(/咆哮 风圧 振动 拘束 属性やられ 状态异常 (\S+) (\S+) (\S+)/);
  if (!jp || !m) continue;
  B[jp] = { roar: norm(m[1]), wind: norm(m[2]), quake: norm(m[3]) };
}
const out = {}, conflicts = [];
for (const name of new Set([...Object.keys(A), ...Object.keys(B)])) {
  const a = A[name] || {}, b = B[name] || {};
  const pick = (k) => {
    const va = a[k], vb = b[k];
    // source B has no 特大 (damaging roar) class, so 特大 in A against 大 in B is not a disagreement
    if (k === "roar" && [va, vb].includes("特大") && [va, vb].includes("大")) return "特大";
    if (va != null && vb != null && va !== vb) { conflicts.push(`${name} ${k}: A=${va || "なし"} B=${vb || "なし"}`); return [va, vb]; }
    return va ?? vb ?? undefined;
  };
  const r = { roar: pick("roar"), wind: pick("wind"), quake: b.quake ?? undefined };
  for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
  if (Object.keys(r).length) out[name] = r;
}
writeFileSync(new URL("../data/hazards.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(`A ${Object.keys(A).length}, B ${Object.keys(B).length}, out ${Object.keys(out).length}, conflicts ${conflicts.length}`);
for (const c of conflicts) console.log("  " + c);
