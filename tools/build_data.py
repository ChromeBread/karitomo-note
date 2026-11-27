"""Convert cached source pages (tools/cache/raw) into the app's data/*.json.

Safe to run on a partial cache: missing pages are skipped and reported.
Usage: py -I tools/build_data.py
"""
import re, json, html, pathlib, collections

TOOLS = pathlib.Path(__file__).resolve().parent
RAW = TOOLS / "cache" / "raw"
OUT = TOOLS.parent / "data"
EXTRA = TOOLS / "extra"  # hand-made fixes (armor parts etc.)
PARTS = "頭胴腕腰脚"
ITEMS = {}  # item id -> name, filled from every link we see


def read(p):
    f = RAW / p
    return f.read_text(encoding="utf-8") if f.exists() else None


def strip(s):
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def body(h):
    """Main content only (drops nav menus, scripts, search templates)."""
    h = re.sub(r"<(script|style)\b.*?</\1>", "", h, flags=re.S)
    i = h.find('<div class="col-lg-10')
    return h[i:] if i >= 0 else h


def trs(h):
    return re.findall(r"<tr[^>]*>(.*?)</tr>", h, flags=re.S)


def tds(tr):
    return re.findall(r"<t[dh]([^>]*)>(.*?)</t[dh]>", tr, flags=re.S)


def links(h, kind):
    out = []
    for i, name in re.findall(rf'href="/{kind}/([0-9a-f]+)"[^>]*>(.*?)</a>', h, flags=re.S):
        name = strip(name)
        if kind == "item":
            ITEMS.setdefault(i, name)
        out.append((i, name))
    return out


def text_lines(h):
    """Page as lines of text where links become [kind:id]name, like tools/totext.py."""
    h = body(h)
    h = re.sub(r'<a [^>]*href="/(item|mon|quest|map|skill|bougu|buki)/([0-9a-f]+)"[^>]*>(.*?)</a>',
               lambda m: f"[{m[1]}:{m[2]}]{strip(m[3])}", h, flags=re.S)
    h = re.sub(r"</(tr|p|div|h\d|li|table)>|<br\s*/?>", "\n", h)
    h = re.sub(r"<(td|th)[^>]*>", " | ", h)
    h = re.sub(r"<[^>]+>", "", h)
    h = html.unescape(h)
    lines = [re.sub(r"[ \t]+", " ", l).strip() for l in h.split("\n")]
    for l in lines:
        for i, n in re.findall(r"\[item:([0-9a-f]+)\]([^\[|]+?)(?: x\d+)?\s*(?=\||$|\[)", l):
            ITEMS.setdefault(i, n.strip())
    return [l for l in lines if l]


def num(s):
    s = s.replace(",", "").strip()
    try:
        return float(s) if "." in s else int(s)
    except ValueError:
        return None


def slots(s):
    return s.count("◯") if "―" in s or "◯" in s else (num(s) or 0)


def skill_pts(s):
    return {n: int(v) for n, v in re.findall(r"([^\s:：|]+?)\s*[:：]\s*([+-]\d+)", strip(s))}


# ---------------------------------------------------------------- skills

def build_skills():
    h = body(read("skill.html"))
    trees, cur = [], None
    for tr in trs(h):
        cells = tds(tr)
        sk = links(tr, "skill")
        if sk and len(cells) == 1:
            cur = {"id": sk[0][0], "name": sk[0][1], "effects": []}
            trees.append(cur)
        elif cur and len(cells) == 3:
            pts = num(strip(cells[1][1]).replace("+", ""))
            if pts is not None:
                cur["effects"].append({"name": strip(cells[0][1]), "pts": pts,
                                       "desc": strip(cells[2][1])})
    return trees


# ---------------------------------------------------------------- decorations

def build_decos():
    h = body(read("soushoku.html"))
    out = []
    for tr in trs(h):
        cells = tds(tr)
        it = links(cells[0][1], "item") if cells else []
        if len(cells) < 5 or not it or not re.search(r"[◯―]", strip(cells[1][1])):
            continue
        sk = {}
        for c in cells[2:4]:
            sk.update(skill_pts(c[1]))
        recipes = []
        for part in re.split(r"[AB]:", cells[4][1])[1:]:
            recipes.append([[i, int(q)] for i, q in re.findall(r'href="/item/([0-9a-f]+)"[^>]*>[^<]*</a>\s*x(\d+)', part)])
        out.append({"id": it[0][0], "name": it[0][1], "slots": slots(strip(cells[1][1])),
                    "skills": sk, "recipes": recipes})
    return out


# ---------------------------------------------------------------- armor

def armor_rarity():
    rare = {}
    for r in range(1, 12):
        h = read(f"bougu_rare_{r}.html")
        if h:
            for _, name in links(body(h), "bougu"):
                rare.setdefault(name, r)
    return rare


def load_parts_fix():
    f = EXTRA / "armor_parts.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}


def build_armor():
    rare, fix = armor_rarity(), load_parts_fix()
    out, unresolved = [], []
    for f in sorted((RAW / "bougu").glob("*.html")):
        h = body(f.read_text(encoding="utf-8"))
        sid = f.stem
        names = [strip(x) for x in re.findall(r'<div class="lead">(.*?)</div>', h, flags=re.S)]
        descs = [strip(x) for x in re.findall(r'<small class="text-muted">(.*?)</small>', h, flags=re.S)]
        tables = re.findall(r"<table.*?</table>", h, flags=re.S)
        stat = next((t for t in tables if "防御力" in t and "スロット" in t), None)
        mats = next((t for t in tables if ">Lv<" in t), None)
        if not stat:
            continue
        pieces = []
        for tr in trs(stat)[1:]:
            c = [strip(x[1]) for x in tds(tr)]
            raw = tds(tr)
            if len(c) < 12 or not c[4]:
                continue
            d = [num(x) for x in c[5].replace("～", " ").split()]
            pieces.append({
                "name": c[4], "series": sid,
                "type": (1 if c[0] == "○" else 0) | (2 if c[1] == "○" else 0),
                "gender": (1 if c[2] == "○" else 0) | (2 if c[3] == "○" else 0),
                "def": [d[0], d[-1]] if d else [0, 0],
                "res": [num(x) or 0 for x in c[6:11]],
                "slots": slots(c[11]),
                "skills": skill_pts(raw[12][1]) if len(raw) > 12 else {},
            })
        # materials: one column per piece in the same order
        if mats:
            rows = trs(mats)
            zeny = [num(strip(x[1]).replace("z", "")) for x in tds(rows[1])[1:]] if len(rows) > 1 else []
            for row in rows[2:]:
                cells = tds(row)
                if strip(cells[0][1]) != "1":
                    continue
                for k, cell in enumerate(cells[1:]):
                    if k >= len(pieces):
                        break
                    need, _, back = cell[1].partition("―")
                    pieces[k]["mats"] = [[i, int(q)] for i, q in re.findall(r'href="/item/([0-9a-f]+)"[^>]*>[^<]*</a>\s*x(\d+)', need)]
                    pieces[k]["zeny"] = zeny[k] if k < len(zeny) else 0
                    links(cell[1], "item")
        # parts: a full set is in head..legs order; otherwise use the fix file / description
        for k, p in enumerate(pieces):
            if p["name"] in fix:
                p["part"] = fix[p["name"]]
            elif len(pieces) == 5:
                p["part"] = k
            else:
                desc = descs[k] if k < len(descs) else ""
                m = re.search(r"(頭|胴|腕|腰|脚)(用|部)", desc)
                if m:
                    p["part"] = PARTS.index(m[1])
                else:
                    unresolved.append(p["name"])
                    continue
            p["rare"] = rare.get(p["name"], 0)
            out.append(p)
    return out, unresolved


# ---------------------------------------------------------------- monsters

RANKS = ["下位", "上位", "G級"]


def build_monsters():
    out = []
    idx = body(read("mon.html") or "")
    order = [i for i, _ in links(idx, "mon")]
    for f in sorted((RAW / "mon").glob("*.html"), key=lambda f: order.index(f.stem) if f.stem in order else 999):
        raw = f.read_text(encoding="utf-8")
        h = body(raw)
        L = text_lines(raw)
        name = next((L[i + 1] for i, l in enumerate(L) if l.startswith("[mon:") and "モンスタ一一覧" in L[i + 1:i + 2] is False), None)
        m = re.search(r'<div class="lead">(.*?)</div>', h) or re.search(r"<h\d[^>]*>(.*?)</h\d>", h)
        # name: line right after the "モンスタ一一覧" link
        for i, l in enumerate(L):
            if l == "モンスタ一一覧" and i + 1 < len(L):
                name = L[i + 1]
                break
        mon = {"id": f.stem, "name": name, "hitzones": [], "parts": [], "resist": {},
               "drops": {}, "quests": []}
        # hitzones: every table whose header has 切 打 弾
        states = [strip(s) for s in re.findall(r'href="#state-[a-z0-9]+"[^>]*>(.*?)</a>', h, flags=re.S)]
        hz_tables = [t for t in re.findall(r"<table.*?</table>", h, flags=re.S) if ">切<" in t and ">打<" in t]
        for k, t in enumerate(hz_tables):
            parts = []
            for tr in trs(t)[1:]:
                c = [strip(x[1]) for x in tds(tr)]
                if len(c) >= 11 and c[0]:
                    parts.append([c[0]] + [num(x) or 0 for x in c[1:11]])
            mon["hitzones"].append({"state": states[k] if k < len(states) else "", "parts": parts})
        pt = next((t for t in re.findall(r"<table.*?</table>", h, flags=re.S) if ">エキス<" in t), None)
        if pt:
            for tr in trs(pt)[1:]:
                c = [strip(x[1]) for x in tds(tr)]
                if len(c) >= 3 and c[0]:
                    # "120 [320]" = flinch 120, sever 320 (tails); keep sever as the 4th field
                    fl = re.match(r"\s*(\d+)\s*(?:\[\s*(\d+)\s*\])?", c[1])
                    row = [c[0], int(fl[1]) if fl else num(c[1]), c[2].replace("●", "")]
                    if fl and fl[2]:
                        row.append(int(fl[2]))
                    mon["parts"].append(row)
        rt = next((t for t in re.findall(r"<table.*?</table>", h, flags=re.S) if ">蓄積値減少<" in t), None)
        if rt:
            for tr in trs(rt)[1:]:
                c = [strip(x[1]) for x in tds(tr)]
                if len(c) >= 7 and c[0]:
                    mon["resist"][c[0]] = [num(c[1]), num(c[2].replace("+", "")), num(c[3]), num(c[4]), c[5], c[6]]
        # drops (text based)
        # the drop list ends at the next section ("武器", or "防具" when no weapon uses this monster)
        a = L.index("アイテム一覧") if "アイテム一覧" in L else 0
        b = next((i for i in range(a + 1, len(L)) if a and L[i] in ("武器", "防具", "マップ一覧")), a)
        rank = method = None
        for l in L[a + 1:b]:
            if l in RANKS:
                rank = l
            elif re.fullmatch(r"\|\s*[^\[\]|%]+", l):
                method = l.strip("| ").strip()
            else:
                m = re.match(r"\|\s*\[item:([0-9a-f]+)\][^|]*?(?: x(\d+))?\s*\|\s*(\d+)%", l)
                if m and rank and method:
                    mon["drops"].setdefault(rank, {}).setdefault(method, []).append(
                        [m[1], int(m[2] or 1), int(m[3])])
        # quests where it appears: "map / エリアN" then quest row
        loc = None
        for l in L:
            mm = re.fullmatch(r"\|\s*(\S+)", l)
            if mm and not l.startswith("| ["):
                loc = mm[1]
                continue
            ma = re.fullmatch(r"エリア(\d+)", l)
            if ma and loc:
                loc = (loc, int(ma[1])) if isinstance(loc, str) else loc
                continue
            mq = re.match(r"\|\s*\[quest:([0-9a-f]+)\][^|]*\|\s*([\d,]+) HP\s*\|\s*x([\d.]+)\s*\|\s*x([\d.]+)\s*\|\s*x([\d.]+)", l)
            if mq and isinstance(loc, tuple):
                mon["quests"].append({"q": mq[1], "map": loc[0], "area": loc[1], "hp": num(mq[2]),
                                      "atk": float(mq[4]), "def": float(mq[5])})
                loc = None
        out.append(mon)
    return out


# ---------------------------------------------------------------- maps

def build_maps():
    out = []
    for f in sorted((RAW / "map").glob("*.html")):
        L = text_lines(f.read_text(encoding="utf-8"))
        name, areas, area, rank, qty = None, [], None, None, None
        for i, l in enumerate(L):
            if name is None and l.startswith("[map:") and "→" in l and i + 1 < len(L):
                name = L[i + 1]
                continue
            m = re.fullmatch(r"エリア(\d+)", l)
            if m:
                area = {"no": int(m[1]), "items": {}}
                areas.append(area)
                continue
            if l in RANKS:
                rank = l
                continue
            m = re.fullmatch(r"\|?\s*x(\d+)〜(\d+)", l)
            if m:
                qty = (int(m[1]), int(m[2]))
                continue
            m = re.match(r"\|\s*\[item:([0-9a-f]+)\][^|]*\|\s*(\d+)%", l)
            if m and area and rank:
                area["items"].setdefault(rank, []).append([m[1], qty[0] if qty else 1, qty[1] if qty else 1, int(m[2])])
        out.append({"id": f.stem, "name": name, "areas": areas})
    return out


# ---------------------------------------------------------------- quests

VENDORS = {0: "村", 1: "集会所", 4: "特殊許可", 2: "闘技大会", 3: "訓練"}


def build_quests():
    out, seen = [], set()
    for v, vname in VENDORS.items():
        h = body(read(f"quest_vendor_{v}.html") or "")
        tabs = dict(re.findall(r'href="#(s\d+-\d+)" role="tab">\s*(.*?)\s*</a>', h))
        for pane_id, pane in re.findall(r'<div class="tab-pane[^"]*" id="(s\d+-\d+)" role="tabpanel">(.*?)(?=<div class="tab-pane|$)', h, flags=re.S):
            rows = trs(pane)
            for k, tr in enumerate(rows):
                q = links(tr, "quest")
                if not q or q[0][0] in seen:
                    continue
                seen.add(q[0][0])
                cells = tds(tr)
                info = cells[0][1]
                badge = strip(" ".join(re.findall(r'<span class="badge[^"]*">(.*?)</span>', info)))
                kind = strip((re.findall(r"<div>(.*?)</div>", info) or [""])[0])
                mp = links(info, "map")
                objs = [strip(cells[-2][1])]
                nxt = tds(rows[k + 1]) if k + 1 < len(rows) else []
                if nxt:
                    objs.append(strip(nxt[0][1]))
                hrp = num(re.sub(r"\D", "", strip(cells[-1][1])) or "0")
                out.append({"id": q[0][0], "name": q[0][1], "vendor": vname, "tab": strip(tabs.get(pane_id, "")),
                            "badge": badge, "kind": kind, "map": mp[0][1] if mp else "",
                            "mons": [i for i, _ in links(tr, "mon")], "goal": objs[0],
                            "sub": objs[1] if len(objs) > 1 and objs[1] != "なし" else "", "hrp": hrp})
    # details: rewards and per-monster stats
    for q in out:
        raw = read(f"quest/{q['id']}.html")
        if not raw:
            continue
        L = text_lines(raw)
        q["mstats"], q["rewards"] = [], []
        for j, l in enumerate(L):
            m = re.match(r"(?:\|\s*)+\[mon:([0-9a-f]+)\][^|]*\|\s*([\d ,]*)\|\s*([\d,]+) HP\s*\|\s*x([\d.]+)\s*\|\s*x([\d.]+)\s*\|\s*x([\d.]+)", l)
            if m:
                st = {"mon": m[1], "area": m[2].strip(), "hp": num(m[3]), "atk": float(m[5]), "def": float(m[6])}
                intr = re.fullmatch(r"\|\s*乱入\s*(\d+)%", L[j - 1]) if j else None  # "| 乱入20%" = intruder, 20% chance
                if intr:
                    st["intrude"] = int(intr[1])
                q["mstats"].append(st)
        try:
            a = L.index("入手アイテム")
            b = next(i for i in range(a, len(L)) if L[i] in ("サイズ", "支給品"))
        except (ValueError, StopIteration):
            a = b = 0
        # rgroups: [[label, [[item, qty, pct], ...]], ...] e.g. 報酬1 / 報酬2 / サブ
        q["rgroups"] = []
        for l in L[a:b]:
            g = re.match(r"\|\s*\|\s*([^|\[]+?)\s*$", l)
            if g:
                q["rgroups"].append([g[1], []])
                continue
            m = re.match(r"\|\s*\[item:([0-9a-f]+)\][^|]*?(?: x(\d+))?\s*\|\s*(\d+)%", l)
            if m:
                if not q["rgroups"]:
                    q["rgroups"].append(["報酬", []])
                q["rgroups"][-1][1].append([m[1], int(m[2] or 1), int(m[3])])
            m = re.match(r"\|\s*\[item:([0-9a-f]+)\]", l)
            if m and m[1] not in q["rewards"]:
                q["rewards"].append(m[1])
    return out


# ---------------------------------------------------------------- mixing (調合リスト)

def build_mix():
    """[[result, a, b, pct, qty], ...]; b is "" for single-material recipes."""
    out = []
    for l in text_lines(read("mix.html") or ""):
        m = re.match(r"\|\s*\[item:(\w+)\][^|]*\|\s*=\s*\|\s*\[item:(\w+)\][^|]*\|(?:\s*\+\s*\|\s*\[item:(\w+)\][^|]*\|)?\s*(\d+)%\s*\|\s*x([\d~〜-]+)", l)
        if m:
            out.append([m[1], m[2], m[3] or "", int(m[4]), m[5]])
    return out


# ---------------------------------------------------------------- weapons

WEAPON_TYPES = {"dai": "大剣", "tachi": "太刀", "kata": "片手剣", "sou": "双剣", "ham": "ハンマー", "fue": "狩猟笛",
                "lan": "ランス", "gun": "ガンランス", "saxe": "スラッシュアックス", "caxe": "チャージアックス",
                "rod": "操虫棍", "lbg": "ライトボウガン", "hbg": "ヘビィボウガン", "yumi": "弓"}
COLORS = ["red", "orange", "yellow", "green", "blue", "white", "purple"]
# bowgun ammo table: one-letter label -> ammo name (levels follow in order)
AMMO = {"通": "通常弾", "回": "回復弾", "火": "火炎弾", "貫": "貫通弾", "毒": "毒弾", "水": "水冷弾", "散": "散弾", "麻": "麻痺弾",
        "雷": "電撃弾", "徹": "徹甲榴弾", "睡": "睡眠弾", "氷": "氷結弾", "拡": "拡散弾", "減": "減気弾", "龍": "滅龍弾"}


def bowgun_info(cells):
    """reload / recoil / deviation, ammo capacities (0 = cannot load), rapid-fire or crouch list, built-in ammo."""
    info = strip(cells[2][1])
    out = {}
    for key, label in (("reload", "リロ"), ("recoil", "反動"), ("dev", "ブレ")):
        m = re.search(label + r":\s*(\S+)", info)
        if m:
            out[key] = m[1]
    ammo = {}
    for lab, spans in re.findall(r"([" + "".join(AMMO) + r"])\s*((?:<span class=\"text-(?:primary|muted)\">\s*\d+</span>)+)", cells[3][1]):
        ammo[AMMO[lab]] = [int(n) if cls == "primary" else 0 for cls, n in re.findall(r'text-(primary|muted)">\s*(\d+)', spans)]
    out["ammo"] = {k: v for k, v in ammo.items() if any(v)}
    if len(cells) > 4:
        first, _, second = cells[4][1].partition("&horbar;")
        item = r"((?:LV\d\s*)?[^\[\]<>]+?)\s*\[([^\]]+)\](?:\s*(やや小|やや大|特大|小|中|大)(?=\s|$))?"
        sp = [[a.strip(), b.strip()] + ([c] if c else []) for a, b, c in re.findall(item, strip(first))]

        if sp:
            out["special"] = sp  # light: 速射 [shots/power] recoil; heavy: しゃがみ撃ち [shots]
        builtin = [[a.strip(), b.strip()] for a, b, _ in re.findall(item, strip(second))]
        if builtin:
            out["builtin"] = builtin
    return out
ELEM_NAMES = ["火", "水", "雷", "氷", "龍", "毒", "麻痺", "睡眠", "爆破"]


def weapon_details(wid, names):
    """Per level {lv: {"make": mats, "up": mats, "from": weapon block id}} from /buki/<id>.
    Materials after "―" are by-products and are dropped; category materials
    ("○○素材 LV1: 8") cannot be checked and are dropped too."""
    raw = read(f"buki/{wid}.html")
    if not raw:
        return None
    h = body(raw)
    i = h.find(">生産<")
    if i < 0:
        return {}
    t = h[h.rfind("<table", 0, i):h.find("</table>", i)]
    out = {}
    mats_of = lambda cell: [[i, int(q)] for i, q in re.findall(r'href="/item/([0-9a-f]+)"[^>]*>[^<]*</a>\s*x(\d+)', cell.partition("―")[0])]
    for tr in trs(t)[1:]:
        cells = tds(tr)
        if len(cells) < 4:
            continue
        links(tr, "item")
        target = strip(cells[0][1]).split("↳")[0].split("↓")[-1].strip()  # "↳" starts a branch to another weapon
        m = re.match(r"(.+?)\s*LV\s*(\d+)$", target)
        if not m or m[1].strip() not in names:
            continue  # a row about another weapon branching off this one
        m = [m[2]]
        head = cells[0][1].split("&darr;")[0] if "&darr;" in cells[0][1] else ""
        src = re.search(r'href="/buki/([0-9a-f]+)"', head)
        src_lv = re.search(r"LV\s*(\d+)", strip(head)) if src else None  # "ハルバード LV4 ↓ ディシジョン LV1"
        out[int(m[-1])] = {"make": mats_of(cells[2][1]), "up": mats_of(cells[3][1]), "from": src[1] if src else None,
                           "fromLv": int(src_lv[1]) if src_lv else None}
    return out


def build_weapons():
    out = []
    for key, tname in WEAPON_TYPES.items():
        raw = read(f"{key}.html")
        if not raw:
            continue
        widths = {c: int(w) for c, w in re.findall(r"\.(page_speed_\d+)\s*\{\s*width:\s*(\d+)px", raw)}
        h = body(raw)
        block, by_key = None, {}
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", h, flags=re.S):
            cells = tds(tr)
            w = links(tr, "buki")
            first = strip(cells[0][1]) if cells else ""
            if w and not re.search(r" LV\d+$", first):
                block = w[0][0]  # lineage block; names can change along the levels
                continue
            m = re.match(r"(.+) LV(\d+)$", first)
            if not (block and m and len(cells) >= 4):
                continue
            key = (block, m[1].strip())
            cur = by_key.get(key)
            if cur is None:
                cur = by_key[key] = {"id": block, "type": tname, "name": m[1].strip(), "levels": []}
                out.append(cur)
            info = strip(cells[2][1])
            elem = re.search(r"(火|水|雷|氷|龍|毒|麻痺|睡眠|爆破)\s*(\d+)", info)
            aff = re.search(r"([+-]\d+)%", info)
            bars = []
            for bar in re.findall(r'<div class="sharpness-bar[^"]*">(.*?)</div>', cells[3][1], flags=re.S):
                spans = re.findall(r'<span class="(page_speed_\d+) (\w+)"', bar)
                vals = {col: widths.get(cls, 0) for cls, col in spans}
                bars.append([vals.get(c, 0) for c in COLORS])
            lv = {"lv": int(m[2]), "atk": num(strip(cells[1][1])) or 0,
                  "elem": [elem[1], int(elem[2])] if elem else None, "aff": int(aff[1]) if aff else 0,
                  "slots": slots(strip(cells[-2][1])), "rare": ("X" if "X" in strip(cells[-1][1]) else num(re.sub(r"\D", "", strip(cells[-1][1])) or "0") or 0)}
            if any(sum(b) for b in bars):
                lv["sharp"] = bars
            if tname in ("ライトボウガン", "ヘビィボウガン"):
                lv.update(bowgun_info(cells))

            cur["levels"].append(lv)
    details = {}
    for wp in out:
        det = details.get(wp["id"])
        if det is None:
            det = details[wp["id"]] = weapon_details(wp["id"], {w["name"] for w in out if w["id"] == wp["id"]})
        if det:
            for lv in wp["levels"]:
                d = det.get(lv["lv"])
                if d:
                    if d["make"]: lv["make"] = d["make"]
                    if d["up"]: lv["up"] = d["up"]
                    if d["from"]: lv["from"] = d["from"]
                    if d.get("fromLv"): lv["fromLv"] = d["fromLv"]

    return out


def main():
    OUT.mkdir(exist_ok=True)
    data = {"skills": build_skills(), "decos": build_decos()}
    data["armor"], unresolved = build_armor()
    data["monsters"] = build_monsters()
    data["maps"] = build_maps()
    data["quests"] = build_quests()
    # English quest names (for MHGU video search), from the English quest list pages
    en = {}
    for f in sorted((TOOLS / "cache" / "en_quest").glob("*.html")):
        for qid, name in re.findall(r'href="/en/quest/([0-9a-f]+)"[^>]*>([^<]+)', f.read_text(encoding="utf-8")):
            en[qid] = html.unescape(name).strip()
    for q in data["quests"]:
        if q["id"] in en:
            q["en"] = en[q["id"]]
    data["weapons"] = build_weapons()
    data["mix"] = build_mix()
    data["items"] = ITEMS
    # pouch limits ("最大所持数 x10") for the items fetched one by one (delivery quest items)
    data["carry"] = {}
    # item pages fetched one by one: delivery items (cache/item_pages) and pouch items (cache/raw/item)
    for f in sorted(list((TOOLS / "cache" / "item_pages").glob("*.html")) + list((RAW / "item").glob("*.html"))):
        m = re.search(r"最大所持数\s*x(\d+)", strip(f.read_text(encoding="utf-8")))
        if m:
            data["carry"][f.stem] = int(m[1])
    for k, v in data.items():
        (OUT / f"{k}.json").write_text(json.dumps(v, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(k, len(v))
    (TOOLS / "cache" / "unresolved_parts.txt").write_text("\n".join(unresolved), encoding="utf-8")
    print("armor pieces without a part:", len(unresolved))


if __name__ == "__main__":
    main()
