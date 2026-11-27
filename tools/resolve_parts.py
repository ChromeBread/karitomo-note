"""Fill tools/extra/armor_parts.json for armor pieces whose part is unclear.
Matches the source site's English names (same order as the Japanese page) against
English armor lists that name the part of every piece.
Usage: py -I -X utf8 tools/resolve_parts.py <armor_list_json_dir>
"""
import json, re, sys, html, pathlib, glob

TOOLS = pathlib.Path(__file__).resolve().parent
PART = {"Head": 0, "Torso": 1, "Arms": 2, "Waist": 3, "Feet": 4, "Legs": 4}
norm = lambda s: re.sub(r"[^a-z0-9]", "", html.unescape(s).lower())

en_part = {}
for f in glob.glob(str(pathlib.Path(sys.argv[1]) / "*_*.json")):
    t = json.loads(pathlib.Path(f).read_text(encoding="utf-8"))["parse"]["wikitext"]["*"]
    for part, name in re.findall(r"\|\s*(Head|Torso|Arms|Waist|Feet|Legs)-Name\s*=\s*([^\n|]+)", t):
        en_part.setdefault(norm(re.sub(r"\[\[|\]\]", "", name)), PART[part])

unresolved = set((TOOLS / "cache" / "unresolved_parts.txt").read_text(encoding="utf-8").split("\n"))
lead = lambda h: [html.unescape(re.sub(r"<[^>]+>", "", x)).strip() for x in re.findall(r'<div class="lead">(.*?)</div>', h, flags=re.S)]
fix, still = {}, []
for f in glob.glob(str(TOOLS / "cache" / "en_bougu" / "*.html")):
    en = lead(pathlib.Path(f).read_text(encoding="utf-8"))
    ja = lead((TOOLS / "cache" / "raw" / "bougu" / pathlib.Path(f).name).read_text(encoding="utf-8"))
    for j, e in zip(ja, en):
        if j in unresolved:
            e = e[len(j):] if e.startswith(j) else e
            p = en_part.get(norm(e))
            if p is None:
                still.append(f"{j} / {e}")
            else:
                fix[j] = p
out = TOOLS / "extra" / "armor_parts.json"
old = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {}
old.update(fix)
out.write_text(json.dumps(old, ensure_ascii=False, indent=0), encoding="utf-8")
print(f"resolved {len(fix)}, still unknown {len(still)}")
print("\n".join(still))
