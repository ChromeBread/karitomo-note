// Skill simulator core (no DOM). Used by sim-worker.js and tests/sim.test.html.
// Game rules: 5 armor pieces + weapon slots + charm; decorations fill slots;
// a skill tree activates an effect when its total reaches the effect's points
// (positive) or falls to it (negative). "胴系統倍加" pieces add the torso's
// points again (including decorations in torso slots).

export const TORSO_UP = "胴系統倍加";

// Max skill points a set of decorations can give tree `t` per slot used, for bounds.
function bestRatio(decos, t) {
  let r = 0;
  for (const d of decos) if (d.skills[t] > 0) r = Math.max(r, d.skills[t] / d.slots);
  return r;
}

// Keep only pieces that are not strictly worse than another one for this search.
// keepDef: a minimum defense is set, so a piece may only be beaten by one with at least its defense.
// keepRes: element resistance minimums are set, so likewise for each resistance.
const NO_RES = [0, 0, 0, 0, 0];
export function prune(pieces, trees, keepDef = false, keepRes = false) {
  const key = (p) => trees.map((t) => p.skills[t] || 0);
  const list = pieces.map((p) => ({ p, k: key(p) }));
  const out = [];
  for (const a of list) {
    const tu = !!a.p.skills[TORSO_UP];
    let dominated = false;
    for (const b of list) {
      if (a === b || !!b.p.skills[TORSO_UP] !== tu) continue;
      const ge = b.k.every((v, i) => v >= a.k[i]) && b.p.slots >= a.p.slots && (!keepDef || b.p.def[1] >= a.p.def[1]) &&
        (!keepRes || (b.p.res || NO_RES).every((v, i) => v >= (a.p.res || NO_RES)[i]));
      const gt = b.k.some((v, i) => v > a.k[i]) || b.p.slots > a.p.slots ||
        (b.p.def[1] > a.p.def[1]) || (b.p.def[1] === a.p.def[1] && list.indexOf(b) < list.indexOf(a));
      if (ge && gt) { dominated = true; break; }
    }
    if (!dominated) out.push(a.p);
  }
  return out;
}

// Try to fill slot groups with decorations so every deficit is covered.
// groups: [{size, mult}] (mult 1 normally, 1+torsoUps for the torso).
// Returns list of [groupIndex, deco] or null. Checks negatives on required trees.
export function fillDecos(groups, deficit, decos, trees) {
  return makeFiller(decos, trees)(groups, deficit);
}

// Precomputes decoration combos once per search; returns (groups, deficit) => fill | null.
export function makeFiller(decos, trees) {
  const useful = decos.filter((d) => trees.some((t) => d.skills[t] > 0));
  // options per group size: multisets of useful decos fitting in size (size <= 3)
  const opts = {};
  for (const size of [1, 2, 3]) {
    const res = [[]];
    const rec = (start, left, cur) => {
      for (let i = start; i < useful.length; i++) {
        const d = useful[i];
        if (d.slots <= left) {
          const next = [...cur, d];
          res.push(next);
          rec(i, left - d.slots, next);
        }
      }
    };
    rec(0, size, []);
    opts[size] = res;
  }
  const ratios = Object.fromEntries(trees.map((t) => [t, bestRatio(useful, t)]));
  return (groups, deficit) => {
  const order = groups.map((g, i) => i).sort((a, b) => groups[b].size * groups[b].mult - groups[a].size * groups[a].mult);
  const need = { ...deficit };
  const chosen = [];
  const remainingCap = (from) => {
    let c = 0;
    for (let j = from; j < order.length; j++) c += groups[order[j]].size * groups[order[j]].mult;
    return c;
  };
  const feasible = (from) => {
    let slotsNeeded = 0;
    for (const t of trees) {
      if (need[t] > 0) {
        if (!ratios[t]) return false;
        slotsNeeded += need[t] / ratios[t];
      }
    }
    return slotsNeeded <= remainingCap(from) + 1e-9;
  };
  const rec = (k) => {
    if (trees.every((t) => need[t] <= 0)) return true;
    if (k >= order.length || !feasible(k)) return false;
    const g = groups[order[k]];
    for (const combo of opts[g.size]) {
      let helps = combo.length === 0;
      for (const d of combo) for (const t of trees) if (d.skills[t] > 0 && need[t] > 0) helps = true;
      if (!helps) continue;
      for (const d of combo) for (const [t, v] of Object.entries(d.skills)) if (t in need) need[t] -= v * g.mult;
      chosen.push(...combo.map((d) => [order[k], d]));
      if (rec(k + 1)) return true;
      chosen.length -= combo.length;
      for (const d of combo) for (const [t, v] of Object.entries(d.skills)) if (t in need) need[t] += v * g.mult;
    }
    return false;
  };
  return rec(0) ? chosen : null;
  };
}

// params: {targets: {tree: points}, pieces: {0..4: [...]}, charms: [...], decos: [...],
//          weaponSlots, limit, deadline (optional epoch ms: give up quietly after it),
//          minDef / minSlots (optional: max defense and armor slot total of the 5 pieces),
//          minRes (optional: [火,水,雷,氷,龍] minimum armor resistance totals, null = no limit),
//          avoid (optional: [{tree, pts}] effects that must not activate), minFree (optional: slots left empty after decorations)}
// Yields result objects; stops after `limit`.
export function* search(params) {
  const { targets, decos, weaponSlots = 0, limit = 100, minDef = 0, minSlots = 0 } = params;
  const minRes = (params.minRes || []).map((v) => (typeof v === "number" ? v : null));
  const resOn = minRes.some((v) => v !== null);
  const trees = Object.keys(targets);
  const avoid = params.avoid || [], minFree = params.minFree || 0;
  // trees of avoided negative effects also decide which pieces may be dropped as "worse" (less negative is better)
  const keyTrees = [...trees, ...avoid.filter((a) => a.pts < 0 && !trees.includes(a.tree)).map((a) => a.tree)];
  const parts = [0, 1, 2, 3, 4].map((i) => prune(params.pieces[i] || [], keyTrees, minDef > 0, resOn));
  // best resistance each element can still get from the remaining parts
  const sufRes = Array.from({ length: 6 }, () => [0, 0, 0, 0, 0]);
  for (let i = 4; i >= 0; i--) for (let e = 0; e < 5; e++) sufRes[i][e] = sufRes[i + 1][e] + Math.max(-99, ...parts[i].map((p) => (p.res || NO_RES)[e]));
  const curRes = [0, 0, 0, 0, 0];
  // best defense / slots the remaining parts can still add, to cut branches below the minimums
  const sufDef = [0, 0, 0, 0, 0, 0], sufSlots = [0, 0, 0, 0, 0, 0];
  for (let i = 4; i >= 0; i--) {
    sufDef[i] = sufDef[i + 1] + Math.max(0, ...parts[i].map((p) => p.def[1]));
    sufSlots[i] = sufSlots[i + 1] + Math.max(0, ...parts[i].map((p) => p.slots));
  }
  let curDef = 0, curSlots = 0;
  // "no charm" stays a candidate: owned charms can carry negative points
  const charms = prune([...params.charms, { name: "なし", skills: {}, slots: 0, def: [0, 0] }], keyTrees);
  const ratios = Object.fromEntries(trees.map((t) => [t, bestRatio(decos, t)]));
  // upper bound of points each remaining part can add per tree (pieces + slots as decorations)
  const maxPart = parts.map((list) => Object.fromEntries(trees.map((t) =>
    [t, Math.max(0, ...list.map((p) => Math.max(0, p.skills[t] || 0) + p.slots * ratios[t]))])));
  const suffix = [];
  for (let i = 5; i >= 0; i--) {
    suffix[i] = Object.fromEntries(trees.map((t) => [t, i === 5 ? 0 : suffix[i + 1][t] + maxPart[i][t]]));
  }
  const charmMax = Object.fromEntries(trees.map((t) =>
    [t, Math.max(0, ...charms.map((c) => Math.max(0, c.skills[t] || 0) + c.slots * ratios[t]))]));
  const filler = makeFiller(decos, trees);
  let found = 0;
  const chosen = [];
  const pts = Object.fromEntries(trees.map((t) => [t, 0]));
  let torsoUps = 0;

  function* finish() {
    for (const c of charms) {
      const total = { ...pts };
      for (const t of trees) total[t] += (c.skills[t] || 0) + torsoUps * (chosen[1].skills[t] || 0);
      const deficit = Object.fromEntries(trees.map((t) => [t, targets[t] - total[t]]));
      const groups = [
        ...chosen.map((p, i) => ({ size: p.slots, mult: i === 1 ? 1 + torsoUps : 1, src: i })),
        { size: weaponSlots, mult: 1, src: "weapon" },
        { size: c.slots, mult: 1, src: "charm" },
      ].filter((g) => g.size > 0);
      const fill = filler(groups, deficit);
      if (!fill) continue;
      const r = { pieces: [...chosen], charm: c, decos: fill.map(([g, d]) => [groups[g].src, d]), torsoUps };
      // shortcut: avoid / minFree are checked on the first decoration fill found, not on every possible fill
      if (minFree && groups.reduce((s, g) => s + g.size, 0) - fill.reduce((s, [, d]) => s + d.slots, 0) < minFree) continue;
      if (avoid.length) { const sum = totals(r); if (avoid.some((a) => (a.pts < 0 ? (sum[a.tree] || 0) <= a.pts : (sum[a.tree] || 0) >= a.pts))) continue; }
      yield r;
      if (++found >= limit) return;
    }
  }

  function* rec(i) {
    if (found >= limit || (params.deadline && Date.now() > params.deadline)) return;
    if (i === 5) { yield* finish(); return; }
    for (const p of parts[i]) {
      const tu = p.skills[TORSO_UP] ? 1 : 0;
      chosen.push(p); torsoUps += tu; curDef += p.def[1]; curSlots += p.slots;
      const pr = p.res || NO_RES;
      for (let e = 0; e < 5; e++) curRes[e] += pr[e];
      for (const t of trees) pts[t] += p.skills[t] || 0;
      // prune: even with best remaining parts, charm and weapon slots, can every target be reached?
      let ok = curDef + sufDef[i + 1] >= minDef && curSlots + sufSlots[i + 1] >= minSlots &&
        (!resOn || minRes.every((m, e) => m === null || curRes[e] + sufRes[i + 1][e] >= m));
      if (ok) for (const t of trees) {
        // slots of already chosen pieces (torso slots count once per torso multiplier)
        let slotPts = 0;
        for (let j = 0; j < chosen.length; j++) if (j !== 1) slotPts += chosen[j].slots * ratios[t];
        const ups = torsoUps + 4 - i; // torso-up pieces we may still add
        const torso = chosen[1]
          ? ups * Math.max(0, chosen[1].skills[t] || 0) + (1 + ups) * chosen[1].slots * ratios[t]
          : maxPart[1][t] * 4;
        const best = pts[t] + slotPts + suffix[i + 1][t] + charmMax[t] + weaponSlots * ratios[t] + torso;
        if (best < targets[t]) { ok = false; break; }
      }
      if (ok) yield* rec(i + 1);
      for (const t of trees) pts[t] -= p.skills[t] || 0;
      chosen.pop(); torsoUps -= tu; curDef -= p.def[1]; curSlots -= p.slots;
      for (let e = 0; e < 5; e++) curRes[e] -= pr[e];

      if (found >= limit) return;
    }
  }
  yield* rec(0);
}

// Totals for a finished set: points per tree including decorations and torso-up.
export function totals(result, weaponSlots = 0) {
  const sum = {};
  const add = (sk, m = 1) => { for (const [t, v] of Object.entries(sk)) if (t !== TORSO_UP) sum[t] = (sum[t] || 0) + v * m; };
  result.pieces.forEach((p, i) => add(p.skills, i === 1 ? 1 + result.torsoUps : 1));
  add(result.charm.skills);
  for (const [src, d] of result.decos) add(d.skills, src === 1 ? 1 + result.torsoUps : 1);
  void weaponSlots;
  return sum;
}

// Activated effects for totals, using skill tree data [{name, effects:[{name, pts}]}].
export function activated(sum, trees) {
  const out = [];
  for (const tr of trees) {
    const v = sum[tr.name] || 0;
    let best = null;
    for (const e of tr.effects) {
      if (e.pts > 0 && v >= e.pts && (!best || e.pts > best.pts)) best = e;
      if (e.pts < 0 && v <= e.pts && (!best || e.pts < best.pts)) best = e;
    }
    if (best) out.push({ tree: tr.name, ...best, total: v });
  }
  return out;
}

// 仮想護石: the weakest charms (1 or 2 of the target skills, 0-3 slots) that make the search find something.
// params as for search(); late() = true once time is up. Returns {charms: [{skills, slots}], timeout}.
export function vcharms(params, late = () => false, maxPts = 13, perTryMs = 200) {
  const trees = Object.keys(params.targets), found = [];
  let timeout = false;
  const ok = (skills, slots) => {
    if (late()) { timeout = true; return false; }
    return !search({ ...params, charms: [{ name: "仮想護石", skills, slots, def: [0, 0] }], limit: 1, deadline: Date.now() + perTryMs }).next().done;
  };
  for (let slots = 3; slots >= 0 && !timeout; slots--) { // 3 slots first: those charms need fewer points, so they are likelier in the game
    for (const t of trees) for (let v = 1; v <= maxPts && !timeout; v++) if (ok({ [t]: v }, slots)) { found.push({ skills: { [t]: v }, slots }); break; }
    // pairs: walk the staircase (a from high to low, b from low up); more points never hurt
    for (let i = 0; i < trees.length; i++) for (let j = i + 1; j < trees.length; j++) {
      let b = 1;
      for (let a = maxPts; a >= 1 && b <= maxPts && !timeout; a--) {
        while (b <= maxPts && !ok({ [trees[i]]: a, [trees[j]]: b }, slots)) b++;
        if (b <= maxPts) found.push({ skills: { [trees[i]]: a, [trees[j]]: b }, slots });
      }
    }
  }
  // keep only charms no other found charm beats (needs no more points anywhere and no more slots)
  const le = (x, y) => x.slots <= y.slots && Object.entries(x.skills).every(([t, v]) => v <= (y.skills[t] || 0));
  const charms = found.filter((c, i) => !found.some((d, k) => k !== i && le(d, c) && !(le(c, d) && k > i)));
  return { charms, timeout };
}
