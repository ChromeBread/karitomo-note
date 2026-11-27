// Weapon ranking: expected damage per hit against a chosen monster's softest part.
// Community values: class multipliers to remove displayed-attack bloat,
// sharpness multipliers, affinity as +-25% on crits. Motion values are a typical
// average per weapon type so raw and element can be compared on one scale.
import { canMake } from "./unlock.js?v=1.0.0";
import { match } from "./kana.js?v=1.0.0";

const CLASS = { 大剣: 4.8, 太刀: 3.3, 片手剣: 1.4, 双剣: 1.4, ハンマー: 5.2, 狩猟笛: 4.2, ランス: 2.3, ガンランス: 2.3,
  スラッシュアックス: 3.5, チャージアックス: 3.6, 操虫棍: 3.1, ライトボウガン: 1.3, ヘビィボウガン: 1.5, 弓: 1.2 };
// shortcut: one average motion value per type; upgrade to per-move values if users want exact numbers
const MV = { 大剣: 0.48, 太刀: 0.28, 片手剣: 0.2, 双剣: 0.12, ハンマー: 0.42, 狩猟笛: 0.33, ランス: 0.27, ガンランス: 0.25,
  スラッシュアックス: 0.3, チャージアックス: 0.25, 操虫棍: 0.2, ライトボウガン: 0.1, ヘビィボウガン: 0.12, 弓: 0.12 };
const SHARP_RAW = [0.5, 0.75, 1.0, 1.05, 1.2, 1.32, 1.39];
const SHARP_ELEM = [0.25, 0.5, 0.75, 1.0, 1.0625, 1.125, 1.2];
const SHARP_NAME = ["赤", "橙", "黄", "緑", "青", "白", "紫"];
const IMPACT = new Set(["ハンマー", "狩猟笛"]);
const GUN = new Set(["ライトボウガン", "ヘビィボウガン", "弓"]);
const ELEM_COL = { 火: 4, 水: 5, 雷: 6, 氷: 7, 龍: 8 }; // index in hitzone row [name, 切, 打, 弾, 火, 水, 雷, 氷, 龍, ...]

export function score(w, lv, mon, takumi) {
  const raw = lv.atk / CLASS[w.type];
  const bar = lv.sharp ? lv.sharp[Math.min(takumi, lv.sharp.length - 1)] : null;
  const color = bar ? bar.reduce((best, v, i) => (v > 0 ? i : best), 0) : 2;
  const aff = 1 + 0.25 * (lv.aff / 100);
  const hzCol = GUN.has(w.type) ? 3 : IMPACT.has(w.type) ? 2 : 1;
  const parts = mon?.hitzones[0]?.parts || [];
  const hz = parts.length ? Math.max(...parts.map((p) => p[hzCol])) / 100 : 1;
  const physical = raw * (GUN.has(w.type) ? 1 : SHARP_RAW[color]) * aff * MV[w.type] * hz;
  let element = 0;
  if (lv.elem && ELEM_COL[lv.elem[0]] && parts.length) {
    const ehz = Math.max(...parts.map((p) => p[ELEM_COL[lv.elem[0]]])) / 100;
    element = lv.elem[1] * (GUN.has(w.type) ? 1 : SHARP_ELEM[color]) * ehz;
  }
  return { total: physical + element, physical, element, color };
}

// Highest level reachable per lineage block. A level is reachable when it can be
// made from scratch, or the level below is reachable and the upgrade materials are
// obtainable (for LV1, the weapon it is upgraded from must be reachable).
export function reachableLevels(weapons, have) {
  const byBlock = {};
  for (const w of weapons) for (const l of w.levels) (byBlock[w.id] ||= []).push(l);
  for (const lvs of Object.values(byBlock)) lvs.sort((a, b) => a.lv - b.lv);
  const out = {};
  for (let pass = 0; pass < 100; pass++) { // repeat until upgrade chains across blocks settle
    let changed = false;
    for (const [id, lvs] of Object.entries(byBlock)) {
      let max = 0;
      for (const l of lvs) {
        const prevOk = l.lv === 1 ? (l.from ? (out[l.from] || 0) > 0 : false) : max === l.lv - 1;
        if (canMake(l.make, have) || (prevOk && canMake(l.up, have))) max = l.lv; else break;
      }
      if ((out[id] || 0) !== max) { out[id] = max; changed = true; }
    }
    if (!changed) break;
  }
  return out;
}

export function render({ view, D, have, state, save, esc, rareTag }) {
  const p = state.prefs;
  p.rankType ||= "太刀"; p.rankTakumi ??= 0; p.rankOnlyMake ??= false;
  const types = [...new Set(D.weapons.map((w) => w.type))];
  const mons = D.monsters.filter((m) => m.hitzones.length);
  const hasMats = D.weapons.some((w) => w.levels.some((l) => l.make || l.up));
  view.innerHTML = `
    <div class="card">
      <div class="row">
        <select id="type">${types.map((t) => `<option ${t === p.rankType ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
        <select id="mon"><option value="">相手を選ばない（物理だけ）</option>${mons.map((m) => `<option value="${m.id}" ${m.id === p.rankMon ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>
      </div>
      <div class="row">
        <label>匠 <select id="tk">${[0, 1, 2].map((n) => `<option value="${n}" ${n === p.rankTakumi ? "selected" : ""}>${n ? "+" + n : "なし"}</option>`).join("")}</select></label>
        <label class="check"><input type="checkbox" id="mk" ${p.rankOnlyMake && hasMats ? "checked" : ""} ${hasMats ? "" : "disabled"}>進行チェックで作れる武器だけ${hasMats ? "" : "（素材データ準備中）"}</label>
      </div>
      <input type="search" id="q" placeholder="武器名で絞り込み（ひらがな可）">
    </div>
    <div id="out"></div>
    <p class="muted">順位の目安: 物理（表示攻撃力÷武器倍率×斬れ味×会心率×平均モーション値×いちばん柔らかい部位の肉質）＋属性（属性値×斬れ味補正×属性肉質）。倍率はコミュニティ調べの値で、ボウガンと弓は弾・矢の種類を考えていません。状態異常（毒・麻痺・睡眠・爆破）はダメージに入れていません。</p>`;
  const $ = (s) => view.querySelector(s);
  const draw = () => {
    p.rankType = $("#type").value; p.rankMon = $("#mon").value; p.rankTakumi = +$("#tk").value; p.rankOnlyMake = $("#mk").checked;
    save();
    const mon = D.monById[p.rankMon];
    const q = $("#q").value;
    const rows = [];
    const reach = reachableLevels(D.weapons, have);
    for (const w of D.weapons) {
      if (w.type !== p.rankType || !match(q, w.name, D.readings)) continue;
      const lvs = p.rankOnlyMake ? w.levels.filter((l) => l.lv <= (reach[w.id] || 0)) : w.levels;
      if (!lvs.length) continue;
      const lv = lvs[lvs.length - 1];
      rows.push({ w, lv, s: score(w, lv, mon, p.rankTakumi) });
    }
    rows.sort((a, b) => b.s.total - a.s.total);
    const top = rows[0]?.s.total || 1;
    $("#out").innerHTML = rows.length ? `<ol class="list">${rows.slice(0, 50).map((r, i) => `<li><div class="item">
      <b style="width:2em">${i + 1}</b>
      <span class="grow"><a href="#find/weapon/${r.w.id}/${encodeURIComponent(r.w.name)}">${esc(r.w.name)}</a> <span class="muted">LV${r.lv.lv}</span> ${rareTag(r.lv.rare)}
        <span class="ruby">攻撃${r.lv.atk}${r.lv.aff ? ` 会心${r.lv.aff > 0 ? "+" : ""}${r.lv.aff}%` : ""}${r.lv.elem ? ` <span class="el-${r.lv.elem[0]}">${r.lv.elem[0]}${r.lv.elem[1]}</span>` : ""}${r.lv.sharp ? ` 斬れ味${SHARP_NAME[r.s.color]}` : ""} ${"◯".repeat(r.lv.slots)}</span>
        <span class="bar"><i style="width:${(100 * r.s.total) / top}%"></i></span></span>
      <span class="muted">${r.s.total.toFixed(1)}</span></div></li>`).join("")}</ol>` : `<p class="muted">条件に合う武器がありません。</p>`;
  };
  for (const s of ["#type", "#mon", "#tk", "#mk"]) $(s).onchange = draw;
  $("#q").oninput = draw;
  draw();
}
