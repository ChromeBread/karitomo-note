// 効果重複の計算機: attack from the displayed weapon attack plus the chosen items / skills / melodies,
// following the stacking groups in the 仕様メモ (one pick per group, different groups stack).
// shortcut: the order "displayed attack × multipliers + additions" is assumed (known from later
// titles, not confirmed for MHXX); switch the formula here if a verified order is found.

// Each group: one choice. kind add = +N to attack, mul = ×N, crit = +N% 会心率.
export const ATK_GROUPS = [
  { id: "talon", label: "護符・爪", opts: [["なし", 0], ["力の護符 +6", 6], ["力の爪 +9", 9], ["護符と爪 +15", 15]], kind: "add" },
  { id: "potion", label: "鬼人薬", opts: [["なし", 0], ["鬼人薬 +5", 5], ["鬼人薬グレート +7", 7]], kind: "add" },
  { id: "meal", label: "ネコ飯（攻撃力UP）", opts: [["なし", 0], ["【小】+3", 3], ["【中】+5", 5], ["【大】+7", 7]], kind: "add" },
  { id: "seed", label: "種・笛・弾など（最後に使ったもの）", opts: [["なし", 0], ["怪力の種 / 鬼人笛 / ドキドキノコ / 鬼人弾 +10", 10], ["鬼人会心弾・ネコの舞踏術 +15", 15], ["怪力の丸薬 +25", 25]], kind: "add" },
  { id: "hypno", label: "ネコの短期催眠術", opts: [["なし", 0], ["+3", 3]], kind: "add" },
  { id: "skill", label: "攻撃力UPスキル", opts: [["なし", 0], ["【小】+10", 10], ["【中】+15", 15], ["【大】・真打 +20", 20]], kind: "add" },
  { id: "chal", label: "挑戦者・フルチャージ（優先: 挑戦者）", opts: [["なし", 0], ["挑戦者+1 +10・会心+10%", 10, 10], ["挑戦者+2 +20・会心+15%", 20, 15], ["フルチャージ（武闘家）+20", 20]], kind: "add" },
  { id: "wind", label: "北風・南風の狩人", opts: [["なし", 0], ["北風（クーラーを飲んだ）+5", 5], ["寒い・暑いエリアで +15", 15]], kind: "add" },
  { id: "dire", label: "死中に活（状態異常中）", opts: [["なし", 0], ["+20", 20]], kind: "add" },
  { id: "grudge", label: "逆恨み（赤ゲージがある）", opts: [["なし", 0], ["+20", 20]], kind: "add" },
  { id: "heroics", label: "火事場", opts: [["なし", 1], ["火事場力+2 ×1.3", 1.3], ["ネコの火事場力 ×1.35", 1.35]], kind: "mul" },
  { id: "horn", label: "狩猟笛の攻撃力強化", opts: [["なし", 1], ["【小】×1.1", 1.1], ["【小】重ねがけ ×1.15", 1.15], ["【大】×1.15", 1.15], ["【大】重ねがけ ×1.2", 1.2]], kind: "mul" },
  { id: "fortify", label: "不屈", opts: [["なし", 1], ["1回力尽きた ×1.1", 1.1], ["2回力尽きた ×1.2", 1.2]], kind: "mul" },
  { id: "dragon", label: "龍気活性（発動中）", opts: [["なし", 1], ["×1.1", 1.1]], kind: "mul" },
  { id: "blunt", label: "鈍器使い（いまの斬れ味）", opts: [["なし", 1], ["緑 ×1.1", 1.1], ["黄 ×1.15", 1.15], ["橙・赤 ×1.2", 1.2]], kind: "mul" },
  { id: "unleash", label: "力の解放（発動中）", opts: [["なし", 0], ["+1 会心+30%", 0, 30], ["+2 会心+50%", 0, 50]], kind: "add" },
];
// 挑戦者 > フルチャージ > 力の解放: only the highest-priority one of these works at a time.
const PRIORITY = ["chal", "unleash"];

// picks: {groupId: option index}. Returns totals and the floored attack.
export function attackCalc(base, picks, baseCrit = 0) {
  let add = 0, mul = 1, crit = 0;
  const firstOn = PRIORITY.find((id) => picks[id] > 0);
  for (const g of ATK_GROUPS) {
    if (PRIORITY.includes(g.id) && g.id !== firstOn) continue;
    const o = g.opts[picks[g.id] || 0];
    if (g.kind === "mul") mul *= o[1]; else add += o[1];
    crit += o[2] || 0;
  }
  const attack = Math.floor(base * mul + add);
  const critAll = Math.max(-100, Math.min(100, baseCrit + crit));
  // expected value with 会心 (+25% on a crit, -25% on a negative crit)
  const expected = attack * (1 + 0.25 * critAll / 100);
  return { add, mul, attack, crit: critAll, expected };
}

// Chance that a hit is cut by 30%: 精霊王の加護 (horn) wins alone; otherwise 加護 then the meal skill.
export function guardChance({ kago = false, meal = 0, horn = false }) {
  if (horn) return 0.5;
  const k = kago ? 0.25 : 0, m = meal === 2 ? 0.25 : meal === 1 ? 0.125 : 0;
  return 1 - (1 - k) * (1 - m);
}

export function renderCalc(view, { esc, state, save }) {
  const c = (state.prefs.calc ||= { base: 200, crit: 0, picks: {}, kago: false, meal: 0, horn: false });
  const sel = (g) => `<label class="calcrow"><span>${esc(g.label)}</span><select data-g="${g.id}">${g.opts.map((o, i) => `<option value="${i}" ${(c.picks[g.id] || 0) === i ? "selected" : ""}>${esc(o[0])}</option>`).join("")}</select></label>`;
  view.innerHTML = `
    <div class="card"><div class="row"><label>武器の攻撃力（表示）<br><input id="cb" type="number" inputmode="numeric" min="1" max="999" value="${c.base}" style="width:6em"></label>
      <label>武器の会心率 %<br><input id="cc" type="number" inputmode="numeric" min="-100" max="100" value="${c.crit}" style="width:6em"></label></div></div>
    <div class="card" id="cout"></div>
    <h2>足し算の効果</h2><div class="card">${ATK_GROUPS.filter((g) => g.kind === "add").map(sel).join("")}</div>
    <h2>掛け算の効果</h2><div class="card">${ATK_GROUPS.filter((g) => g.kind === "mul").map(sel).join("")}</div>
    <h2>ダメージを減らす効果</h2><div class="card">
      <label class="check"><input type="checkbox" id="gk" ${c.kago ? "checked" : ""}>精霊の加護（スキル）</label>
      <label class="calcrow"><span>ネコの防御術</span><select id="gm">${["なし", "【小】", "【大】"].map((l, i) => `<option value="${i}" ${c.meal === i ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" id="gh" ${c.horn ? "checked" : ""}>狩猟笛 精霊王の加護</label>
      <div id="gout"></div></div>
    <p class="muted">めやすです。MHXXでは表示攻撃力がそのまま計算に使われ、アイテムなどの「+いくつ」はそこに足されます。掛け算の効果を足し算より先に掛ける順番は、後の作品で知られている形を仮に使っていて、MHXXで確かめたものではありません。数値とグループは仕様メモ「効果重複」と同じです。</p>`;
  const draw = () => {
    const r = attackCalc(c.base, c.picks, c.crit);
    view.querySelector("#cout").innerHTML = `<div class="big">攻撃力 ${r.attack}</div>
      <div class="muted">${c.base} × ${+r.mul.toFixed(4)} ＋ ${r.add}（小数は切り捨て）／ 会心率 ${r.crit}% ／ 会心込みの期待値 ${r.expected.toFixed(1)}</div>`;
    const g = guardChance(c);
    view.querySelector("#gout").innerHTML = `<p>攻撃を受けたとき <b>${(g * 100).toFixed(1)}%</b> の確率でダメージ30%減${c.horn && (c.kago || c.meal) ? "（精霊王の加護が効いているあいだは、ほかの加護は効きません）" : ""}</p>`;
  };
  view.querySelectorAll("[data-g]").forEach((s) => (s.onchange = () => { c.picks[s.dataset.g] = +s.value; save(); draw(); }));
  const num = (id, key, lo, hi) => (view.querySelector(id).oninput = (e) => { const v = parseInt(e.target.value, 10); c[key] = Number.isNaN(v) ? (key === "base" ? 1 : 0) : Math.max(lo, Math.min(hi, v)); save(); draw(); });
  num("#cb", "base", 1, 999); num("#cc", "crit", -100, 100);
  view.querySelector("#gk").onchange = (e) => { c.kago = e.target.checked; save(); draw(); };
  view.querySelector("#gm").onchange = (e) => { c.meal = +e.target.value; save(); draw(); };
  view.querySelector("#gh").onchange = (e) => { c.horn = e.target.checked; save(); draw(); };
  draw();
}
