"""Build data/readings.json (name -> hiragana) from hand-written word readings.

A name gets a reading only when every kanji run is fully covered by
tools/extra/readings_dict.txt (greedy longest match). Full-name overrides go in
tools/extra/readings_override.txt ("name reading" per line).
Names without a reading are listed in tools/cache/no_reading.txt.
Usage: py -I -X utf8 tools/make_readings.py
"""
import json, re, pathlib

TOOLS = pathlib.Path(__file__).resolve().parent
DATA = TOOLS.parent / "data"


def load_pairs(path):
    out = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                # "name<TAB>reading" for names with spaces (quest names), otherwise "name reading"
                k, _, v = line.partition("\t") if "\t" in line else line.partition(" ")
                if v.strip():
                    out[k] = v.strip()
    return out


DICT = load_pairs(TOOLS / "extra" / "readings_dict.txt")
OVERRIDE = load_pairs(TOOLS / "extra" / "readings_override.txt")
MAXLEN = max(map(len, DICT)) if DICT else 1
KANJI = re.compile(r"[一-鿿々]")


def hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def read(name):
    if name in OVERRIDE:
        return OVERRIDE[name]
    out, i = [], 0
    while i < len(name):
        if KANJI.match(name[i]):
            for n in range(min(MAXLEN, len(name) - i), 0, -1):
                w = name[i:i + n]
                if w in DICT and (n > 1 or KANJI.match(w)):
                    v = DICT[w]
                    out.append(v); i += n
                    # dict readings often include the okurigana (守 まもり + り): skip it once.
                    # の is a particle, not okurigana (斧の = おのの).
                    while i < len(name) and name[i] != "の" and "ぁ" <= name[i] <= "ん" and v.endswith(name[i]):
                        i += 1
                        v = v[:-1]
                    break
            else:
                return None
        else:
            out.append(hira(name[i])); i += 1
    return "".join(out)


def main():
    L = lambda n: json.loads((DATA / f"{n}.json").read_text(encoding="utf-8")) if (DATA / f"{n}.json").exists() else []
    names = set()
    for t in L("skills"):
        names.add(t["name"]); names.update(e["name"] for e in t["effects"])
    items = L("items")
    names.update(items.values() if isinstance(items, dict) else [])
    for k in ("monsters", "armor", "decos", "weapons"):
        names.update(x["name"] for x in L(k))
    names.update(m["name"] for m in L("maps") if m.get("name"))
    names.update(q["name"] for q in L("quests"))

    out, missing = {}, []
    for n in sorted(names):
        if not KANJI.search(n):
            continue  # kana-only names are converted in the app
        r = read(n)
        if r:
            out[n] = r
        else:
            missing.append(n)
    (DATA / "readings.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (TOOLS / "cache" / "no_reading.txt").write_text("\n".join(missing), encoding="utf-8")
    print(f"readings: {len(out)}, without reading: {len(missing)}")


if __name__ == "__main__":
    main()
