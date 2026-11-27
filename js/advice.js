// Quest preparation advice from one player's data (own or a friend's): which owned weapon / equipment
// myset / item myset to take for a quest with a chosen weapon type, what to make next, and which event
// quests (downloaded or not) fight the same monsters. No DOM, so tests can run it in node.
import { score } from "./rank.js?v=1.0.1";
import { canMake } from "./unlock.js?v=1.0.1";

const GUNS = new Set(["ライトボウガン", "ヘビィボウガン", "弓"]);
// Armor to make next: per part, makeable pieces (by this player's materials) not made yet that have more
// defense than the best piece already made for that part. gender: 1/2, or 3 when unknown (a friend).
export function armorTargets(armor, owned, have, gunner, gender = 3, perPart = 2) {
  const type = gunner ? 2 : 1, mine = new Set(owned || []);
  return [0, 1, 2, 3, 4].map((part) => {
    const fits = armor.filter((a) => a.part === part && a.type & type && a.gender & gender);
    const best = Math.max(0, ...fits.filter((a) => mine.has(a.name)).map((a) => a.def[1]));
    const list = fits.filter((a) => !mine.has(a.name) && a.def[1] > best && canMake(a.mats, have))
      .sort((a, b) => b.def[1] - a.def[1] || b.slots - a.slots).slice(0, perPart);
    return { part, best, list };
  });
}

const ELEMENTS = ["火", "水", "雷", "氷", "龍"];
const HOT = new Set(["火山", "地底火山", "溶岩島"]);
const COLD = new Set(["雪山", "氷海", "極圏"]);
const DESERT = new Set(["砂漠", "旧砂漠"]);

// best element hitzone per element (softest part), like the monster tab's weakness chart
export function weakness(m) {
  const hz = m?.hitzones?.[0]?.parts || [];
  return ELEMENTS.map((_, i) => Math.max(0, ...hz.map((p) => p[4 + i])));
}

// average expected damage of one weapon level over the quest's large monsters
function avgScore(w, lv, mons) {
  if (!mons.length) return score(w, lv, null, 0).total;
  return mons.reduce((s, m) => s + score(w, lv, m, 0).total, 0) / mons.length;
}

// What the pouch should hold for this quest, with a reason per need.
export function itemNeeds(q) {
  const needs = [];
  if (HOT.has(q.map)) needs.push({ any: ["クーラードリンク"], why: "暑いマップ" });
  if (COLD.has(q.map)) needs.push({ any: ["ホットドリンク"], why: "寒いマップ" });
  if (DESERT.has(q.map)) needs.push({ any: ["クーラードリンク", "ホットドリンク"], why: "砂漠（昼は暑く夜は寒い）", soft: true });
  const captureOnly = /捕獲/.test(q.goal) && !/狩猟|討伐/.test(q.goal);
  if (captureOnly) needs.push({ any: ["捕獲用麻酔玉"], why: "捕獲クエスト" }, { any: ["落とし穴", "シビレ罠"], why: "捕獲クエスト" });
  if (q.kind === "採集") needs.push({ any: ["ピッケルグレート", "ピッケル", "虫あみグレート", "虫あみ"], why: "採集クエスト" });
  if ((q.mstats || q.mons || []).length) needs.push({ any: ["回復薬グレート", "回復薬"], why: "大型モンスター" });
  return needs;
}

// itemSets: [{name, items: [[name, n]]}] — best first, with what each one lacks
export function rankItemSets(itemSets, q) {
  const needs = itemNeeds(q);
  return (itemSets || []).map((s, i) => {
    const have = new Set(s.items.filter(([, n]) => n > 0).map(([n]) => n));
    const lacks = needs.filter((nd) => !nd.any.some((x) => have.has(x)));
    const pts = needs.length - lacks.reduce((t, nd) => t + (nd.soft ? 0.5 : 1), 0) + s.items.length / 100;
    return { i, set: s, lacks, pts };
  }).sort((a, b) => b.pts - a.pts);
}

// Recommended pouch for a quest and weapon type: all 24 item slots (3 pages of 8) and the 8 ammo / coating
// slots, each [name, count, why]. Counts are the pouch limits (D.carry by item id). gun: the bowgun level used
// (its ammo table picks the ammo); notes: data/monnotes.json mons (flash / sonic / trap effectiveness).
export function recommendPouch(D, q, type, gun = null, notes = {}) {
  const idOf = new Map(Object.entries(D.items).map(([id, n]) => [n.normalize("NFKC").replace(/\s/g, ""), id]));
  const max = (name, def) => D.carry?.[idOf.get(name.normalize("NFKC").replace(/\s/g, ""))] ?? def;
  const it = (name, why, def = 10) => [name, max(name, def), why];
  const mons = [...new Set([...(q.mstats || []).map((s) => s.mon), ...(q.mons || [])])].map((id) => D.monById[id]).filter((m) => m?.hitzones?.length);
  const nt = mons.map((m) => notes[m.name] || {});
  const all = (k) => nt.length && nt.every((n) => n[k] === false); // the item does nothing to every monster here
  const gunner = GUNS.has(type), bow = type === "弓";
  const hot = HOT.has(q.map), cold = COLD.has(q.map), desert = DESERT.has(q.map);
  const items = [
    it("回復薬グレート", "体力回復の主力"), it("回復薬", "体力回復"), it("秘薬", "体力全回復と最大値アップ", 2), it("いにしえの秘薬", "体力・スタミナ全回復", 1),
    it("活力剤", "体力の最大値を戻す"), it("こんがり肉", "スタミナの最大値"), it("解毒薬", "毒の回復"), it("元気ドリンコ", "気絶・睡眠などから回復"),
    it("鬼人薬グレート", "攻撃力アップ", 5), it("硬化薬グレート", "防御力アップ", 5), it("怪力の種", "攻撃力アップ（短時間）"), it("忍耐の種", "防御力アップ（短時間）"),
    it("強走薬グレート", "スタミナが減らない", 5),
    gunner ? (bow ? it("空きビン", "ビンの調合用", 99) : it("カラの実", "通常弾・散弾の調合用", 99)) : it("砥石", "斬れ味の回復", 20),
    all("flash") ? it("ウチケシの実", "閃光玉が効かない相手なので、やられ状態の回復に") : it("閃光玉", "動きを止める", 5),
    all("sonic") ? it("漢方薬", "音爆弾が効かない相手なので、気絶の予防に") : it("音爆弾", "音に弱い相手をひるませる"),
    all("shock") ? it("トラップツール", "シビレ罠が効かない相手（落とし穴の調合用）", 2) : it("シビレ罠", "動きを止める・捕獲", 1),
    all("pit") ? it("ネット", "落とし穴が効かない相手（シビレ罠の調合用）") : it("落とし穴", "動きを止める・捕獲", 1),
    it("捕獲用麻酔玉", "捕獲", 8), it("モドリ玉", "ベースキャンプに戻る", 1), it("大タル爆弾Ｇ", "寝ているときの大ダメージ", 2), it("小タル爆弾", "大タル爆弾の起爆・眠りを起こす"),
    hot || desert ? it("クーラードリンク", hot ? "暑いマップ" : "砂漠の昼は暑い", 5) : cold ? it("ホットドリンク", "寒いマップ", 5) : it("生命の粉塵", "仲間ごと体力回復", 3),
    desert ? it("ホットドリンク", "砂漠の夜は寒い", 5) : it("ハチミツ", "回復薬グレートの調合用"),
  ];
  let ammo;
  if (bow) {
    ammo = [it("LV2 強撃ビン", "攻撃力アップ（主力）", 50), it("LV1 強撃ビン", "攻撃力アップ", 50), it("接撃ビン", "近い距離で威力アップ", 20), it("LV1 属性強化ビン", "属性の威力アップ", 20),
      it("麻痺ビン", "麻痺させる", 20), it("睡眠ビン", "眠らせる", 20), it("毒ビン", "毒にする", 20), it("減気ビン", "疲れさせる", 20)]
      .map((a) => [...a.slice(0, 2), `${a[2]}（使える弓だけ）`]);
  } else if (gunner) {
    const caps = gun?.ammo || null, can = (kind, lv) => !caps || (caps[kind] && (caps[kind][lv - 1] || 0) > 0);
    const weakEl = ["火炎弾", "水冷弾", "電撃弾", "氷結弾", "滅龍弾"];
    const w = mons.length ? ELEMENTS.map((_, i) => Math.max(...mons.map((m) => weakness(m)[i]))) : [0, 0, 0, 0, 0];
    const el = w.indexOf(Math.max(...w));
    const cand = [
      ["LV2 通常弾", "通常弾", 2, "主力"], ["LV3 通常弾", "通常弾", 3, "跳ねる通常弾"], ["LV2 貫通弾", "貫通弾", 2, "大きい相手に"], ["LV3 貫通弾", "貫通弾", 3, "大きい相手に"],
      ["LV2 散弾", "散弾", 2, "近い距離で"], [`LV1 ${weakEl[el]}`, weakEl[el], 1, `弱点の属性（${ELEMENTS[el]}）`], ["LV1 徹甲榴弾", "徹甲榴弾", 1, "気絶をとる"], ["LV2 徹甲榴弾", "徹甲榴弾", 2, "気絶をとる"],
      ["LV1 麻痺弾", "麻痺弾", 1, "麻痺させる"], ["LV1 睡眠弾", "睡眠弾", 1, "眠らせる"], ["LV1 回復弾", "回復弾", 1, "仲間の回復"], ["捕獲用麻酔弾", "捕獲用麻酔弾", 1, "捕獲"],
      ["LV3 散弾", "散弾", 3, "近い距離で"], ["LV1 散弾", "散弾", 1, "小型の掃除"], ["LV1 貫通弾", "貫通弾", 1, "大きい相手に"], ["LV1 毒弾", "毒弾", 1, "毒にする"], ["ペイント弾", "ペイント弾", 1, "目印"],
    ];
    ammo = cand.filter(([, k, lv]) => can(k, lv)).slice(0, 8).map(([n, , , why]) => it(n, why, 60));
    // fewer than 8 the gun can load: fill with the next ones of the list, marked (they fit other bowguns)
    for (const [n, , , why] of cand) { if (ammo.length >= 8) break; if (!ammo.some((a) => a[0] === n)) ammo.push(it(n, `${why}（この銃では撃てない。持ち替え用）`, 60)); }
  } else ammo = Array.from({ length: 8 }, () => ["", 0, "剣士は弾を使わないので空き"]);
  return { items, ammo };
}

// who: {ownedW, sets, itemSets, cleared, dl}; reach: block id -> highest makeable level (rank.reachableLevels)
export function adviseQuest(D, q, type, who, reach = {}, have = null, gender = 3) {
  const monIds = [...new Set([...(q.mstats || []).map((s) => s.mon), ...(q.mons || [])])];
  const mons = monIds.map((id) => D.monById[id]).filter((m) => m?.hitzones?.length);
  const weak = ELEMENTS.map((_, i) => (mons.length ? Math.max(...mons.map((m) => weakness(m)[i])) : 0));
  const byName = new Map(D.weapons.map((w) => [w.name, w]));
  const level = (w, lv) => w.levels.find((l) => l.lv === lv);

  const owned = Object.entries(who.ownedW || {}).map(([k, lv]) => {
    const w = byName.get(k.split("/").slice(1).join("/"));
    const l = w && level(w, lv);
    return l && w.type === type ? { w, l, s: avgScore(w, l, mons) } : null;
  }).filter(Boolean).sort((a, b) => b.s - a.s);

  const sets = (who.sets || []).map((s, i) => {
    const w = s.weapon && byName.get(s.weapon);
    if (!w || w.type !== type) return null;
    const lv = Object.entries(who.ownedW || {}).find(([k]) => k.endsWith("/" + w.name))?.[1];
    const l = level(w, lv) || w.levels[w.levels.length - 1];
    return { i, set: s, w, s: avgScore(w, l, mons) };
  }).filter(Boolean).sort((a, b) => b.s - a.s);

  // development targets: makeable now (by this player's progress) and stronger than the best owned
  const best = owned[0]?.s || 0;
  const ownedKeys = new Set(Object.keys(who.ownedW || {}));
  const targets = D.weapons.filter((w) => w.type === type).flatMap((w) => {
    const max = reach[w.id] || 0;
    const l = w.levels.filter((x) => x.lv <= max).pop();
    if (!l) return [];
    const have = ownedKeys.has(`${w.id}/${w.name}`) && who.ownedW[`${w.id}/${w.name}`] >= l.lv;
    return have ? [] : [{ w, l, s: avgScore(w, l, mons) }];
  }).filter((t) => t.s > best).sort((a, b) => b.s - a.s).slice(0, 5);

  // event quests with the same monsters
  const dl = new Set(who.dl || []), cleared = new Set(who.cleared || []);
  const same = D.quests.filter((x) => x.badge === "ＤＬ" && x.vendor === "集会所" && x.id !== q.id &&
    [...(x.mstats || []).map((s) => s.mon), ...(x.mons || [])].some((m) => monIds.includes(m)));
  return {
    armor: have ? armorTargets(D.armor, who.owned, have, GUNS.has(type), gender) : [],
    weaponType: type, mons, weak, owned: owned.slice(0, 5), sets: sets.slice(0, 3), items: rankItemSets(who.itemSets, q).slice(0, 3), needs: itemNeeds(q), targets,
    dlOpen: same.filter((x) => dl.has(x.id) && !cleared.has(x.id)),
    dlMissing: who.dl?.length ? same.filter((x) => !dl.has(x.id)) : [],
  };
}
