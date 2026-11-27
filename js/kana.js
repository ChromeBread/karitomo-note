// Kana helpers for search: katakana -> hiragana, full-width -> half-width alnum.
export const toHira = (s) => (s || "").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
export const norm = (s) => toHira((s || "").normalize("NFKC").toLowerCase()).replace(/\s+/g, "");

// Reading for display: given hand-written readings, else hiragana of a kana-only name, else "".
export function reading(name, readings) {
  if (readings && readings[name]) return readings[name];
  return /^[゠-ヿー・\sＸＳＲXSR]+$/.test(name) ? toHira(name) : "";
}

// Does `name` (or its reading) contain the query?
export const match = (q, name, readings) => {
  const n = norm(q);
  return !n || norm(name).includes(n) || norm(reading(name, readings)).includes(n);
};
