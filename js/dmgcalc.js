// Damage calculators for the 仕様メモ: gunlance shelling, fixed damage (bombs, siege weapons, ammo) and blast.
// Numbers are the ones written in the 固定ダメージ page (js/spec.js); [] in the formulas = drop decimals.

// Gunlance shelling base power per level 1-5 (normal / long / wide) and the fire part.
export const SHELL = {
  通常: { base: [10, 14, 18, 21, 24], fire: [4, 5, 6, 7, 8], fb: 1.2, chg: 1.2, wyvern: [30, 35, 40, 45, 50] },
  放射: { base: [15, 21, 28, 32, 36], fire: [9, 11, 14, 16, 18], fb: 1.0, chg: 1.2, wyvern: [36, 42, 48, 54, 60] },
  拡散: { base: [20, 30, 40, 44, 48], fire: [6, 8, 10, 11, 12], fb: 0.9, chg: 1.45, wyvern: [30, 35, 40, 45, 50] },
};
export const WYVERN_FIRE = [10, 11, 12, 13, 14];
// ブレイヴ砲撃 (n-th shot of a chain) and ブレイヴフルバースト (n shells loaded) multipliers, n = 1..6
export const BRAVE_CHAIN = [1.0, 1.2, 1.5, 2.0, 2.6, 2.6];
export const BRAVE_FB = [0.8, 0.9, 1.0, 1.4, 1.5, 1.6];
// 砲術 skill × ネコの砲撃術: 1.1 / 1.2, the meal ×1.1, product capped at 1.3
export const artMul = (skill, meal) => Math.min(1.3, Math.round([1, 1.1, 1.2][skill] * (meal ? 1.1 : 1) * 100) / 100);

// mode: "shot" | "charge" | "fb" (shots = shells hit) | "brave" (chain = shots in the chain) | "bfb" (shots loaded) | "wyvern"
// Returns {each: [damage per hit], total, fire} — fire is the separate fire part per hit (not confirmed in game).
export function shellDamage({ type, lv, mode = "shot", shots = 1, skill = 0, meal = false, def = 1, fireZone = 0 }) {
  const t = SHELL[type], i = Math.max(0, Math.min(4, lv - 1)), m = artMul(skill, meal);
  const fl = Math.floor;
  if (mode === "wyvern") {
    const d = fl(fl(t.wyvern[i] * m) * def), f = fl(fl(WYVERN_FIRE[i] * fireZone / 100) * def);
    return { each: [d], total: d, fire: f };
  }
  const base = fl(t.base[i] * m), fire = fl(fl(t.fire[i] * fireZone / 100) * def);
  if (mode === "charge") { const d = fl(fl(base * t.chg) * def); return { each: [d], total: d, fire }; }
  if (mode === "brave") {
    const each = Array.from({ length: shots }, (_, k) => fl(fl(base * BRAVE_CHAIN[k]) * def));
    return { each, total: each.reduce((a, b) => a + b, 0), fire };
  }
  if (mode === "fb" || mode === "bfb") {
    const one = fl(fl(mode === "bfb" ? fl(base * t.fb) * BRAVE_FB[shots - 1] : base * t.fb) * def);
    return { each: Array(shots).fill(one), total: one * shots, fire };
  }
  const d = fl(base * def);
  return { each: [d], total: d, fire };
}

// Fixed-damage sources: [label, damage per hit, hits, group]. group: bomb (ボマー ×1.3), siege (砲術 ×1.1/1.2), ammo, none
export const FIXED = [
  ["小タル爆弾", 20, 1, "bomb"], ["打ち上げタル爆弾", 20, 1, "bomb"], ["打ち上げタル爆弾G", 30, 1, "bomb"], ["大タル爆弾", 80, 1, "bomb"],
  ["大タル爆弾G・支給用大タル爆弾", 150, 1, "bomb"], ["対巨龍爆弾", 400, 1, "bomb"],
  ["バリスタの弾", 40, 2, "siege"], ["要塞防衛式弩砲弾", 80, 2, "siege"], ["大砲の弾", 170, 1, "siege"], ["撃龍槍（最大4ヒット）", 255, 4, "none"], ["巨龍砲", 2500, 1, "siege"],
  ["徹甲榴弾LV1の爆発", 25, 1, "siege"], ["徹甲榴弾LV2の爆発", 30, 1, "siege"], ["徹甲榴弾LV3の爆発", 40, 1, "siege"],
  ["拡散弾LV1の子爆弾（3個）", 25, 3, "ammo"], ["拡散弾LV2の子爆弾（4個）", 25, 4, "ammo"], ["拡散弾LV3の子爆弾（5個）", 25, 5, "ammo"],
  ["大砲弾LV1の爆発", 30, 1, "ammo"], ["大砲弾LV2の爆発", 40, 1, "ammo"], ["連爆榴弾の爆発（3回）", 30, 3, "ammo"],
  ["バレットゲイザー I", 20, 1, "none"], ["バレットゲイザー II", 13, 3, "none"], ["バレットゲイザー III", 10, 6, "none"],
];
// count = how many of it; bomber / art = skill on; sleep = first hit on a sleeping monster (bombs ×3).
export function fixedDamage(idx, { count = 1, bomber = false, art = 0, def = 1, sleep = false }) {
  const [, dmg, hits, group] = FIXED[idx];
  let one = dmg;
  if (group === "bomb" && bomber) one = Math.floor(one * 1.3);
  if (group === "siege" && art) one = Math.floor(one * [1, 1.1, 1.2][art]);
  const per = Math.floor(one * def) * hits;
  const first = sleep && group === "bomb" ? Math.floor(one * def) * 3 * hits : per; // 3× only on the hit that wakes it
  return { per, total: first + per * (count - 1) };
}

// Blast: an explosion every time the buildup reaches the threshold; threshold = first + up × (explosions so far) × rankMul,
// up to max. Blade weapons apply status on 1 of 3 hits, so the hit count is rounded up to a multiple of 3 (melee = true).
// Returns per-explosion hits and cumulative hits for n explosions.
export function blastHits({ first, up, max, value, n = 5, rankMul = 1, melee = true }) {
  const out = [];
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const need = Math.min(max || Infinity, first + up * rankMul * k);
    const hits = Math.ceil(need / value) * (melee ? 3 : 1);
    sum += hits;
    out.push({ need, hits, sum });
  }
  return out;
}

// Page #spec/dmg: three small calculators. Inputs are remembered in state.prefs.dmgcalc.
export function renderDmgCalc(view, { esc, D, state, save }) {
  const p = (state.prefs.dmgcalc ||= { type: "通常", lv: 1, mode: "shot", shots: 1, skill: 0, meal: false, def: 1, fire: 0, fx: 4, count: 1, bomber: false, art: 0, sleep: false, mon: "", value: 20, rank: 1, melee: true });
  const opt = (v, cur, label = v) => `<option value="${esc(String(v))}" ${String(v) === String(cur) ? "selected" : ""}>${esc(String(label))}</option>`;
  const mons = (D.monsters || []).filter((m) => m.resist?.["爆"]?.[0] > 0);
  view.innerHTML = `
    <p class="muted">数字は仕様メモの「固定ダメージ」の表から計算します。全体防御率はクエストのページに出ています（わからなければ 1）。</p>
    <div class="card"><label>全体防御率 <input id="def" type="number" step="0.05" min="0.1" max="2" value="${p.def}" style="width:5em"></label></div>
    <div class="card"><b>ガンランスの砲撃</b>
      <div class="row"><label>タイプ <select id="type">${Object.keys(SHELL).map((t) => opt(t, p.type)).join("")}</select></label>
        <label>LV <select id="lv">${[1, 2, 3, 4, 5].map((n) => opt(n, p.lv)).join("")}</select></label>
        <label>撃ち方 <select id="mode">${[["shot", "砲撃"], ["charge", "溜め砲撃"], ["fb", "フルバースト"], ["brave", "ブレイヴ砲撃（連射）"], ["bfb", "ブレイヴフルバースト"], ["wyvern", "竜撃砲"]].map(([v, l]) => opt(v, p.mode, l)).join("")}</select></label>
        <label>発数 <select id="shots">${[1, 2, 3, 4, 5, 6].map((n) => opt(n, p.shots)).join("")}</select></label></div>
      <div class="row"><label>砲術 <select id="skill">${opt(0, p.skill, "なし")}${opt(1, p.skill, "砲術師")}${opt(2, p.skill, "砲術王")}</select></label>
        <label class="check"><input type="checkbox" id="meal" ${p.meal ? "checked" : ""}>ネコの砲撃術</label>
        <label>火の肉質 <input id="fire" type="number" min="0" max="100" value="${p.fire}" style="width:4em"></label></div>
      <div id="shellout" class="big"></div></div>
    <div class="card"><b>固定ダメージ（爆弾・バリスタ・弾など）</b>
      <div class="row"><select id="fx" class="grow">${FIXED.map((f, i) => opt(i, p.fx, `${f[0]}（${f[1]}${f[2] > 1 ? `×${f[2]}` : ""}）`)).join("")}</select>
        <label>個数 <input id="count" type="number" min="1" max="99" value="${p.count}" style="width:4em"></label></div>
      <div class="row"><label class="check"><input type="checkbox" id="bomber" ${p.bomber ? "checked" : ""}>ボマー（爆弾）</label>
        <label>砲術（バリスタ・大砲・徹甲榴弾）<select id="art">${opt(0, p.art, "なし")}${opt(1, p.art, "砲術師")}${opt(2, p.art, "砲術王")}</select></label>
        <label class="check"><input type="checkbox" id="sleep" ${p.sleep ? "checked" : ""}>眠っている相手に1個目（爆弾は3倍）</label></div>
      <div id="fxout" class="big"></div></div>
    <div class="card"><b>爆破属性：何回当てると爆発する？</b>
      <div class="row"><label>モンスター <select id="mon"><option value="">（選ぶ）</option>${mons.map((m) => opt(m.id, p.mon, m.name)).join("")}</select></label>
        <label>武器の爆破属性値 <input id="value" type="number" min="1" max="999" value="${p.value}" style="width:5em"></label></div>
      <div class="row"><label>増え方 <select id="rank">${opt(1, p.rank, "×1（下位・上位）")}${opt(2, p.rank, "×2（G級の目安）")}</select></label>
        <label class="check"><input type="checkbox" id="melee" ${p.melee ? "checked" : ""}>剣士・弓（3回に1回たまる）</label></div>
      <div id="blout"></div></div>`;
  const $ = (s) => view.querySelector(s);
  const read = () => {
    p.def = Math.max(0.1, Math.min(2, parseFloat($("#def").value) || 1));
    for (const k of ["lv", "shots", "skill", "fire", "fx", "count", "art", "value", "rank"]) p[k] = Math.max(0, parseInt($(`#${k}`).value, 10) || 0);
    p.count ||= 1; p.value ||= 1; p.lv ||= 1; p.shots ||= 1;
    for (const k of ["type", "mode", "mon"]) p[k] = $(`#${k}`).value;
    for (const k of ["meal", "bomber", "sleep", "melee"]) p[k] = $(`#${k}`).checked;
    save(); draw();
  };
  const draw = () => {
    const multi = ["fb", "brave", "bfb"].includes(p.mode);
    $("#shots").disabled = !multi;
    const r = shellDamage({ type: p.type, lv: p.lv, mode: p.mode, shots: multi ? p.shots : 1, skill: p.skill, meal: p.meal, def: p.def, fireZone: p.fire });
    $("#shellout").innerHTML = `${r.total}${r.each.length > 1 ? ` <span class="muted">（${r.each.join(" + ")}）</span>` : ""}${p.fire ? ` <span class="muted">＋火 ${r.fire}${r.each.length > 1 ? "／1発" : ""}（未確認）</span>` : ""}`;
    const f = fixedDamage(p.fx, { count: p.count, bomber: p.bomber, art: p.art, def: p.def, sleep: p.sleep });
    $("#fxout").innerHTML = `${f.total} <span class="muted">（1個 ${f.per}）</span>`;
    const m = D.monById?.[p.mon], rz = m?.resist?.["爆"];
    $("#blout").innerHTML = rz ? `<p class="muted">${esc(m.name)}: 最初 ${rz[0]}・1回ごとに +${rz[1]}・最大 ${rz[2]}・爆発のダメージ ${rz[3] ?? "?"}（全体防御率なし）</p>
      <div class="table-wrap"><table><tr><th>爆発</th><th>必要な量</th><th>当てる回数</th><th>合計</th><th>爆発ダメージ合計</th></tr>
      ${blastHits({ first: rz[0], up: rz[1], max: rz[2], value: p.value, n: 6, rankMul: p.rank, melee: p.melee }).map((x, k) => `<tr><td>${k + 1}回目</td><td>${x.need}</td><td>${x.hits}</td><td>${x.sum}</td><td>${rz[3] != null ? rz[3] * (k + 1) : "-"}</td></tr>`).join("")}</table></div>
      <p class="muted">回数は「たまる攻撃」の回数です。剣士・弓は3回に1回しかたまらないので3の倍数にしています（運が良ければ早く、悪ければ遅くなります）。</p>` : `<p class="muted">モンスターを選ぶと、その耐性で計算します。</p>`;
  };
  view.querySelectorAll("input, select").forEach((el) => el.addEventListener("change", read));
  draw();
}
