// Runs the skill search off the UI thread and streams results back.
import { search, totals, vcharms } from "./sim.js?v=1.0.0";

self.onmessage = (e) => {
  const p = e.data;
  try {
    if (p.mode === "extra") return extra(p);
    if (p.mode === "vcharm") return vcharm(p);
    const t0 = Date.now();
    let n = 0;
    for (const r of search(p)) {
      n++;
      self.postMessage({ type: "result", result: r, totals: totals(r) });
      if (Date.now() - t0 > (p.timeoutMs || 20000)) { self.postMessage({ type: "done", n, timeout: true }); return; }
    }
    self.postMessage({ type: "done", n, timeout: false });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err) });
  }
};

// 追加スキル検索: which extra skill (or next level of a chosen one) still fits with the current targets.
function extra(p) {
  let unknown = 0;
  p.candidates.forEach(([tree, pts], i) => {
    const deadline = Date.now() + (p.perCandidateMs || 250);
    const hit = search({ ...p, targets: { ...p.targets, [tree]: pts }, limit: 1, deadline }).next();
    if (!hit.done) self.postMessage({ type: "extra", tree, pts });
    else if (Date.now() > deadline) unknown++;
    self.postMessage({ type: "progress", i: i + 1, n: p.candidates.length });
  });
  self.postMessage({ type: "done", unknown });
}

// 仮想護石: when nothing is found, the weakest charms (1 or 2 target skills, 0-3 slots) that would make it work.
function vcharm(p) {
  const stop = Date.now() + (p.totalMs || 30000);
  const r = vcharms(p, () => Date.now() > stop);
  self.postMessage({ type: "done", charms: r.charms, timeout: r.timeout });
}
