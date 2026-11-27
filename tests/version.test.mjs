// node tests/version.test.mjs — every "?v=" in the app and the offline cache name use VERSION,
// so a release never mixes old and new module files.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const app = readFileSync("js/app.js", "utf8");
const version = app.match(/const VERSION = "([^"]+)"/)[1];
const files = ["index.html", ...readdirSync("js").filter((f) => f.endsWith(".js")).map((f) => `js/${f}`)];
let count = 0;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/\?v=([\w.]+)/g)) { count++; assert.equal(m[1], version, `${f}: ?v=${m[1]} but VERSION is ${version}`); }
  // relative module imports must carry the version
  for (const m of text.matchAll(/from "(\.\/[^"]+)"/g)) assert.ok(m[1].includes("?v="), `${f}: import ${m[1]} has no ?v=`);
}
assert.ok(count > 10, `found ${count} versioned URLs`);
assert.match(readFileSync("sw.js", "utf8"), new RegExp(`karitomo-${version.replace(/\./g, "\.")}`));
console.log(`version ${version}: ${count} versioned URLs ok`);
