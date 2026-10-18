"""Generate the static HTML mockups in design/.

Usage: python3 design/tools/build_mockups.py
All data shown is synthetic.
"""
import pathlib

OUT = pathlib.Path(__file__).resolve().parents[1]


def icon(name, cls="i"):
    return f'<svg class="{cls}" aria-hidden="true"><use href="assets/icons.svg#{name}"/></svg>'


def page(title, body, extra_css="", long=False):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}: MyDaybook mockup</title>
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="mockup.css">
<style>{extra_css}</style>
</head>
<body>
<div class="phone{' long' if long else ''}">
{STATUSBAR}
{body}
<div class="home-indicator"></div>
</div>
</body>
</html>
"""


STATUSBAR = """<div class="statusbar" aria-hidden="true"><span>9:41</span><span class="sys">
<span class="bars"><i style="height:4px"></i><i style="height:6px"></i><i style="height:8px"></i><i style="height:11px"></i></span>
<span class="batt"></span></span></div>"""


def tabbar(active):
    tabs = [("today", "house", "Today"), ("trends", "chart-spline", "Trends"), None,
            ("meds", "pill", "Meds"), ("me", "user-round", "Me")]
    out = ['<nav class="tabbar" aria-label="Main">']
    for t in tabs:
        if t is None:
            out.append(f'<button class="fab" aria-label="Log something">{icon("plus")}</button>')
            continue
        key, ic, label = t
        on = " on" if key == active else ""
        cur = ' aria-current="page"' if key == active else ""
        out.append(f'<button class="tab{on}"{cur}>{icon(ic)}<span>{label}</span></button>')
    out.append("</nav>")
    return "\n".join(out)


# ---------------------------------------------------------------- body outline (front)
# Segmented, gender-neutral outline. viewBox 0 0 200 440. Screen-left = the person's RIGHT (front view mirrors).
def _mirror(x, w):
    return 200 - x - w


BODY_REGIONS = [
    # id, label, shape
    ("head", "Head", ("ellipse", 100, 36, 21, 25)),
    ("neck", "Neck", ("rect", 91, 63, 18, 13, 5)),
    ("shoulder-right", "Your right shoulder", ("ellipse", 66, 89, 13, 12)),
    ("shoulder-left", "Your left shoulder", ("ellipse", 134, 89, 13, 12)),
    ("chest-right", "Right side of chest", ("rect", 75, 79, 23.5, 48, 12)),
    ("chest-left", "Left side of chest", ("rect", 101.5, 79, 23.5, 48, 12)),
    ("upper-abdomen", "Upper abdomen", ("rect", 74, 131, 52, 38, 10)),
    ("lower-abdomen", "Lower abdomen", ("rect", 76, 172, 48, 32, 10)),
    ("hip-right", "Your right hip", ("rect", 72, 207, 26, 30, 10)),
    ("hip-left", "Your left hip", ("rect", 102, 207, 26, 30, 10)),
    ("thigh-right", "Your right thigh", ("rect", 74, 240, 24, 74, 11)),
    ("thigh-left", "Your left thigh", ("rect", _mirror(74, 24), 240, 24, 74, 11)),
    ("knee-right", "Your right knee", ("rect", 75, 317, 22, 22, 10)),
    ("knee-left", "Your left knee", ("rect", _mirror(75, 22), 317, 22, 22, 10)),
    ("shin-right", "Your right shin", ("rect", 76, 342, 20, 62, 9)),
    ("shin-left", "Your left shin", ("rect", _mirror(76, 20), 342, 20, 62, 9)),
    ("foot-right", "Your right foot", ("rect", 68, 407, 28, 16, 8)),
    ("foot-left", "Your left foot", ("rect", _mirror(68, 28), 407, 28, 16, 8)),
]
ARM = [("upper-arm", "upper arm", 104, 54, 17, 8.5), ("elbow", "elbow", 161, 14, 17, 7),
       ("forearm", "forearm", 178, 42, 16, 8), ("hand", "hand", 223, 30, 19, 9)]


def _shape(s, attrs, title):
    if s[0] == "ellipse":
        _, cx, cy, rx, ry = s
        return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" {attrs}><title>{title}</title></ellipse>'
    _, x, y, w, h, r = s
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" {attrs}><title>{title}</title></rect>'


def body_svg(fills=None, points=(), selected=None, width=200, label="Body, front view"):
    """fills: region id -> heat level 0..6. points: (x, y, intensity)."""
    fills = fills or {}
    parts = [f'<svg class="body" viewBox="0 0 200 440" width="{width}" role="img" aria-label="{label}">']
    for rid, name, shape in BODY_REGIONS:
        lvl = fills.get(rid)
        cls = "rg" + (f" h{lvl}" if lvl is not None else "") + (" sel" if rid == selected else "")
        parts.append(_shape(shape, f'class="{cls}" data-region="{rid}"', name))
    for side, sx, rot in (("right", 49, 6), ("left", 200 - 49 - 17, -6)):
        cx = 57 if side == "right" else 143
        parts.append(f'<g transform="rotate({rot} {cx} 104)">')
        for rid, nm, y, h, w, r in ARM:
            x = sx + (17 - w) / 2
            full = f"{rid}-{side}"
            lvl = fills.get(full)
            cls = "rg" + (f" h{lvl}" if lvl is not None else "")
            parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" class="{cls}" '
                         f'data-region="{full}"><title>Your {side} {nm}</title></rect>')
        parts.append("</g>")
    for x, y, inten in points:
        parts.append(f'<circle cx="{x}" cy="{y}" r="9" class="pt-halo"/>'
                     f'<circle cx="{x}" cy="{y}" r="5.5" class="pt pt-{min(6, max(1, round(inten * 6 / 10)))}"/>')
    parts.append("</svg>")
    return "".join(parts)


BODY_CSS = """
.body .rg { fill: var(--surface-2); stroke: var(--line); stroke-width: 1.2; }
.body .rg.sel { fill: var(--primary-soft); stroke: var(--primary); stroke-width: 2; }
.body .h1 { fill: var(--heat-1); } .body .h2 { fill: var(--heat-2); } .body .h3 { fill: var(--heat-3); }
.body .h4 { fill: var(--heat-4); } .body .h5 { fill: var(--heat-5); } .body .h6 { fill: var(--heat-6); }
.body .pt-halo { fill: var(--surface); opacity: .9; }
.body .pt { stroke: var(--surface); stroke-width: 1.5; }
.body .pt-1 { fill: var(--heat-2); } .body .pt-2 { fill: var(--heat-3); } .body .pt-3 { fill: var(--heat-4); }
.body .pt-4 { fill: var(--heat-5); } .body .pt-5, .body .pt-6 { fill: var(--heat-6); }
"""


# ---------------------------------------------------------------- charts
def smooth_path(pts):
    """Catmull-Rom to cubic Bezier."""
    d = f"M{pts[0][0]:.1f} {pts[0][1]:.1f}"
    for i in range(len(pts) - 1):
        p0 = pts[max(i - 1, 0)]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[min(i + 2, len(pts) - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}"
    return d


def series(vals, w, h, lo, hi, pad=6):
    step = (w - 2 * pad) / (len(vals) - 1)
    return [(pad + i * step, pad + (h - 2 * pad) * (1 - (v - lo) / (hi - lo))) for i, v in enumerate(vals)]


# ================================================================ SCREENS
def today():
    css = """
.week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: var(--sp-4); }
.day { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 0; border-radius: var(--r-md);
  font-size: var(--fs-caption); color: var(--text-2); }
.day b { font-size: var(--fs-callout); color: var(--text); font-weight: var(--fw-semibold); }
.day i { width: 5px; height: 5px; border-radius: 50%; background: var(--primary); opacity: .55; }
.day.today { background: var(--text); color: var(--bg); } .day.today b { color: var(--bg); }
.day.today i { background: var(--bg); opacity: 1; }
.moods { display: flex; justify-content: space-between; margin-top: var(--sp-3); }
.mood { width: 54px; height: 54px; border-radius: var(--r-full); display: grid; place-items: center; background: var(--surface-2); color: var(--text-2); }
.mood .i { width: 30px; height: 30px; }
.mood.on { background: var(--feel-tint); color: var(--feel-ink); box-shadow: inset 0 0 0 2px var(--feel-ink); }
.dose { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2) 0; }
.dose + .dose { border-top: 1px solid var(--line); }
.dose .grow { flex: 1; } .dose .name { font-weight: var(--fw-semibold); }
.taken { color: var(--meds-ink); font-size: var(--fs-footnote); font-weight: var(--fw-semibold); display: inline-flex; gap: 4px; align-items: center; }
.tl { list-style: none; margin: 0; padding: 0; }
.tl li { display: grid; grid-template-columns: 46px 40px 1fr; gap: var(--sp-3); align-items: start; padding: 10px 0; }
.tl time { font-size: var(--fs-footnote); color: var(--text-2); padding-top: 10px; font-weight: var(--fw-medium); }
.tl .t { font-weight: var(--fw-semibold); } .tl .s { font-size: var(--fs-callout); color: var(--text-2); }
.thumb { width: 100%; height: 86px; border-radius: var(--r-md); margin-top: 8px;
  background: radial-gradient(circle at 30% 40%, #f3d2a2, transparent 45%), radial-gradient(circle at 70% 60%, #b9506a, transparent 35%),
  radial-gradient(circle at 55% 30%, #6c5aa8, transparent 25%), linear-gradient(135deg, #f5e6cf, #e8cfae); }
.tag { display: inline-block; font-size: var(--fs-caption); font-weight: var(--fw-semibold); padding: 2px 8px; border-radius: var(--r-full);
  background: var(--surface-2); color: var(--text-2); margin-top: 4px; }
"""
    moods = "".join(
        f'<button class="mood{" on" if k == 4 else ""}" aria-label="{lbl}"{" aria-pressed=\"true\"" if k == 4 else ""}>{icon(f"face-{k}")}</button>'
        for k, lbl in [(1, "Very low"), (2, "Low"), (3, "Okay"), (4, "Good"), (5, "Great")])
    days = [("M", 12, 1), ("T", 13, 1), ("W", 14, 1), ("T", 15, 0), ("F", 16, 1), ("S", 17, 1), ("S", 18, 1)]
    week = "".join(
        f'<div class="day{" today" if d == 18 else ""}">{w}<b>{d}</b>{"<i></i>" if dot else "<span style=height:5px></span>"}</div>'
        for w, d, dot in days)
    body = f"""
<main class="content">
  <header class="page-head">
    <div><p class="eyebrow">Sunday 18 October</p><h1 class="large-title">Good morning, Sam</h1></div>
    <button class="avatar" aria-label="Switch profile">S</button>
  </header>
  <div class="week">{week}</div>

  <section class="card" aria-labelledby="feel">
    <div class="card-title" id="feel">How are you feeling?</div>
    <p class="card-sub">One tap is enough. Add energy and sleep if you like.</p>
    <div class="moods">{moods}</div>
  </section>

  <section class="card" aria-labelledby="due">
    <div class="card-title" id="due"><span class="cat cat-meds" style="width:32px;height:32px;border-radius:10px">{icon("pill", "i i-sm")}</span>
      Morning medication <span class="muted small" style="margin-left:auto">08:00</span></div>
    <div class="dose" style="margin-top:8px"><div class="grow"><div class="name">Vitamin D</div><div class="card-sub">20 µg · tablet</div></div>
      <button class="btn btn-soft btn-sm">{icon("check", "i i-sm")} Taken</button></div>
    <div class="dose"><div class="grow"><div class="name">Magnesium</div><div class="card-sub">250 mg · tablet</div></div>
      <button class="btn btn-soft btn-sm">{icon("check", "i i-sm")} Taken</button></div>
    <button class="btn btn-primary btn-block" style="margin-top:var(--sp-2); min-height:46px">{icon("check-check", "i i-sm")} Both taken now</button>
  </section>

  <h2 class="section-title">Today <a href="#">See all</a></h2>
  <ol class="tl">
    <li><time>07:10</time><span class="cat cat-sleep">{icon("bed")}</span>
      <div><div class="t">Slept 7 h 20 min</div><div class="s">23:50 to 07:10 · rested · woke once</div></div></li>
    <li><time>07:25</time><span class="cat cat-measure">{icon("scale")}</span>
      <div><div class="t">Weight 72.4 kg</div><div class="s">Morning, before breakfast</div></div></li>
    <li><time>07:40</time><span class="cat cat-gut">{icon("toilet")}</span>
      <div><div class="t">Bowel movement</div><div class="s">Type 4 · no discomfort</div></div></li>
    <li><time>08:10</time><span class="cat cat-food">{icon("utensils")}</span>
      <div><div class="t">Breakfast</div><div class="s">Oatmeal with berries and yoghurt</div><span class="tag">Gluten-free</span> <span class="tag">Contains lactose</span>
      <div class="thumb" role="img" aria-label="Photo of breakfast"></div></div></li>
    <li><time>10:30</time><span class="cat cat-feel">{icon("smile")}</span>
      <div><div class="t">Feeling good</div><div class="s">Mood 4 · Energy 3 · Stress 2</div></div></li>
    <li><time>11:15</time><span class="cat cat-pain">{icon("activity")}</span>
      <div><div class="t">Your right knee</div><div class="s">4 of 10 · aching · after a walk</div></div></li>
  </ol>
</main>
<div class="toast" role="status"><span class="grow">Mood logged</span><button>{icon("undo-2", "i i-sm")} Undo</button></div>
{tabbar("today")}
"""
    return page("Today", body, css)


def quicklog():
    css = """
.bg-blur { filter: blur(1.5px); opacity: .9; }
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-3); }
.tile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; height: 84px;
  border-radius: var(--r-lg); font-weight: var(--fw-semibold); font-size: var(--fs-callout); }
.tile .i { width: 30px; height: 30px; }
.recent { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--r-md); background: var(--surface-2);
  font-size: var(--fs-callout); white-space: nowrap; }
.recent b { font-weight: var(--fw-semibold); }
.recent .cat { width: 30px; height: 30px; border-radius: 9px; }
"""
    tiles = [("food", "utensils", "Meal"), ("feel", "smile", "Feeling"), ("sleep", "bed", "Sleep"),
             ("pain", "activity", "Pain"), ("meds", "pill", "Medicine"), ("gut", "toilet", "Bowel"),
             ("measure", "scale", "Weight"), ("measure", "ruler", "Measure"), ("note", "notebook-pen", "Note")]
    tile_html = "".join(f'<button class="tile cat-{c}">{icon(i)}{t}</button>' for c, i, t in tiles)
    rec = [("food", "bookmark", "Oatmeal", "saved meal"), ("meds", "check-check", "Morning meds", "all taken"),
           ("sleep", "bed", "Usual night", "23:30 to 07:00")]
    rec_html = "".join(
        f'<button class="recent"><span class="cat cat-{c}">{icon(i, "i i-sm")}</span><span><b>{a}</b> <span class="muted">{b}</span></span></button>'
        for c, i, a, b in rec)
    body = f"""
<div class="bg-blur" aria-hidden="true"><main class="content">
  <header class="page-head"><div><p class="eyebrow">Sunday 18 October</p><h1 class="large-title">Good morning, Sam</h1></div>
  <span class="avatar">S</span></header>
  <section class="card" style="height:150px"></section><section class="card" style="height:160px"></section>
</main>{tabbar("today")}</div>
<div class="scrim"></div>
<section class="sheet" role="dialog" aria-modal="true" aria-labelledby="ql">
  <div class="grabber"></div>
  <div class="sheet-head"><h2 id="ql">Log something</h2><span class="time-chip">{icon("clock", "i i-sm")} Now, 09:41 {icon("chevron-down", "i i-sm")}</span></div>
  <div class="tiles">{tile_html}</div>
  <p class="label" style="margin-top:var(--sp-5)">Again? One tap <span class="hint">based on your recent entries</span></p>
  <div class="scroll-row">{rec_html}</div>
  <p class="footnote-lock">{icon("lock", "i i-sm")} Encrypted on this phone before it's saved</p>
</section>
"""
    return page("Quick log", body, css)


def log_feeling():
    css = """
.scale { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.scale button { height: 52px; border-radius: var(--r-md); background: var(--surface-2); color: var(--text-2);
  display: grid; place-items: center; font-weight: var(--fw-semibold); font-size: var(--fs-body); }
.scale button .i { width: 28px; height: 28px; }
.scale button.on { background: var(--feel-tint); color: var(--feel-ink); box-shadow: inset 0 0 0 2px var(--feel-ink); }
.scale-ends { display: flex; justify-content: space-between; font-size: var(--fs-caption); color: var(--text-3); margin-top: 4px; }
.sev { font-size: var(--fs-caption); font-weight: var(--fw-bold); background: var(--surface); padding: 1px 6px; border-radius: var(--r-full); }
"""
    faces = "".join(f'<button class="{"on" if k == 4 else ""}" aria-label="Mood {k} of 5">{icon(f"face-{k}")}</button>' for k in range(1, 6))

    def nums(sel, name):
        return "".join(f'<button class="{"on" if k == sel else ""}" aria-label="{name} {k} of 5">{k}</button>' for k in range(1, 6))
    body = f"""
<div class="scrim" style="background:var(--bg)"></div>
<section class="sheet" role="dialog" aria-modal="true" aria-labelledby="lf" style="top:56px; border-radius: var(--r-xl) var(--r-xl) 0 0">
  <div class="grabber"></div>
  <div class="sheet-head"><button class="icon-btn" aria-label="Back">{icon("chevron-left")}</button>
    <h2 id="lf">How are you?</h2><span class="time-chip">09:41</span></div>

  <p class="label">Mood <span class="hint">last time: 3</span></p>
  <div class="scale">{faces}</div>
  <p class="label">Energy</p>
  <div class="scale">{nums(3, "Energy")}</div>
  <div class="scale-ends"><span>Drained</span><span>Full of energy</span></div>
  <p class="label">Stress</p>
  <div class="scale">{nums(2, "Stress")}</div>
  <div class="scale-ends"><span>Calm</span><span>Very stressed</span></div>

  <p class="label">Anything you notice? <span class="hint">your own tags</span></p>
  <div class="chip-row">
    <span class="chip on">Headache <span class="sev">2</span></span><span class="chip">Tired eyes</span>
    <span class="chip">Bloated</span><span class="chip">Restless</span><span class="chip" style="color:var(--primary-press)">{icon("plus", "i i-sm")} New</span>
  </div>
  <p class="label">Note</p>
  <div class="field">Optional</div>
  <button class="btn btn-primary btn-block" style="margin-top:var(--sp-5)">Save</button>
</section>
"""
    return page("Log feeling", body, css)


def bodymap():
    css = BODY_CSS + """
.stage { position: relative; display: flex; justify-content: center; margin-top: var(--sp-2); }
.side { position: absolute; top: 8px; line-height: 1.25; font-size: var(--fs-caption); font-weight: var(--fw-bold); letter-spacing: .06em; color: var(--text-3); }
.zooms { position: absolute; right: 0; bottom: 6px; display: flex; flex-direction: column; gap: 8px; }
.zooms .chip { min-height: 34px; font-size: var(--fs-footnote); padding: 0 10px; }
.ramp { display: grid; grid-template-columns: repeat(11, 1fr); gap: 3px; margin-top: 6px; }
.ramp span { height: 34px; border-radius: 8px; display: grid; place-items: center; font-size: var(--fs-footnote); font-weight: var(--fw-semibold); }
.ramp span.on { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--text); }
"""
    pts = [(86, 328, 6), (135, 88, 3)]
    ramp_colors = ["heat-0", "heat-1", "heat-1", "heat-2", "heat-2", "heat-3", "heat-3", "heat-4", "heat-5", "heat-5", "heat-6"]
    ramp = "".join(
        f'<span class="{"on" if k == 6 else ""}" style="background:var(--{c});color:{"var(--text)" if k < 7 else "var(--on-heat-hi)"}">{k}</span>'
        for k, c in enumerate(ramp_colors))
    quals = ["Sharp", "Dull", "Burning", "Throbbing", "Aching", "Tingling", "Other"]
    qual = "".join(f'<span class="chip{" on" if q == "Aching" else ""}">{q}</span>' for q in quals)
    body = f"""
<main class="content" style="padding-bottom:0">
  <div class="nav-head"><button class="icon-btn" aria-label="Back">{icon("chevron-left")}</button>
    <span class="title">Where does it hurt?</span><button class="icon-btn" aria-label="Help">{icon("info")}</button></div>
  <div style="display:flex; gap:var(--sp-2); align-items:center">
    <div class="segmented" role="tablist" style="flex:1"><button class="on" role="tab" aria-selected="true">Front</button><button role="tab">Back</button></div>
    <button class="btn btn-quiet btn-sm" style="border-radius:var(--r-full); min-height:42px">{icon("search", "i i-sm")} Find</button></div>
  <div class="stage">
    <span class="side" style="left:0">YOUR<br>RIGHT</span><span class="side" style="right:0; text-align:right">YOUR<br>LEFT</span>
    {body_svg(points=pts, selected="knee-right", width=186)}
    <div class="zooms"><span class="chip">{icon("scan-face", "i i-sm")} Head</span><span class="chip">{icon("hand", "i i-sm")} Hands</span>
      <span class="chip">{icon("footprints", "i i-sm")} Feet</span></div>
  </div>
</main>
<section class="sheet" aria-labelledby="pt" style="box-shadow: 0 -6px 24px rgb(0 0 0 / .10); padding-bottom: calc(var(--safe-bottom) + var(--sp-2))">
  <div class="grabber"></div>
  <div class="sheet-head" style="margin-bottom:var(--sp-2)"><h2 id="pt">Your right knee</h2>
    <span class="muted small">Point 1 of 2</span></div>
  <div class="ramp" role="radiogroup" aria-label="Intensity, 0 none to 10 worst imaginable">{ramp}</div>
  <div class="scroll-row" style="margin-top:var(--sp-3)">{qual}</div>
  <div style="display:flex; gap:var(--sp-3); margin-top:var(--sp-4)">
    <button class="btn btn-quiet" style="flex:1; white-space:nowrap">{icon("plus", "i i-sm")} Point</button>
    <button class="btn btn-primary" style="flex:2">Save 2 points</button></div>
</section>
"""
    return page("Body map", body, css)


def meds():
    css = """
.slot { margin-top: var(--sp-5); }
.slot h3 { font-size: var(--fs-footnote); font-weight: var(--fw-bold); color: var(--text-2); letter-spacing: .04em; text-transform: uppercase;
  display: flex; gap: 6px; align-items: center; margin-bottom: var(--sp-2); }
.med { display: flex; gap: var(--sp-3); align-items: center; }
.med .grow { flex: 1; } .med .name { font-weight: var(--fw-semibold); }
.status { font-size: var(--fs-footnote); font-weight: var(--fw-semibold); display: inline-flex; gap: 4px; align-items: center;
  padding: 4px 10px; border-radius: var(--r-full); }
.st-taken { background: var(--meds-tint); color: var(--meds-ink); }
.st-late { background: var(--food-tint); color: var(--food-ink); }
.st-skip { background: var(--surface-2); color: var(--text-2); }
.actions { display: flex; gap: 6px; }
.remind { display: flex; gap: var(--sp-3); align-items: flex-start; background: var(--surface-2); border-radius: var(--r-lg); padding: var(--sp-4); margin-top: var(--sp-5); }
.toggle { width: 51px; height: 31px; border-radius: 16px; background: var(--meds-ink); position: relative; flex: none; }
.toggle::after { content: ""; position: absolute; right: 2px; top: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: var(--shadow-1); }
.list-row { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3) 0; }
.list-row + .list-row { border-top: 1px solid var(--line); }
"""
    body = f"""
<main class="content">
  <header class="page-head"><h1 class="large-title">Medication</h1>
    <button class="icon-btn" aria-label="Add medication" style="background:var(--primary-soft);color:var(--primary-press)">{icon("plus")}</button></header>
  <div class="segmented" role="tablist"><button class="on" role="tab" aria-selected="true">Today</button><button role="tab">My list</button><button role="tab">History</button></div>

  <div class="slot"><h3>{icon("sunrise", "i i-sm")} Morning · 08:00
    <button class="btn btn-soft btn-sm" style="margin-left:auto; text-transform:none; letter-spacing:0">{icon("check-check", "i i-sm")} All taken</button></h3>
    <div class="card"><div class="med"><span class="cat cat-meds">{icon("pill")}</span>
      <div class="grow"><div class="name">Allergy tablet</div><div class="card-sub">10 mg · 1 tablet · {icon("repeat", "i i-xs")} every day</div></div>
      <span class="status st-taken">{icon("check", "i i-sm")} 08:12</span></div></div>
    <div class="card"><div class="med"><span class="cat cat-meds">{icon("pill")}</span>
      <div class="grow"><div class="name">Vitamin D</div><div class="card-sub">20 µg · 1 tablet · {icon("repeat", "i i-xs")} every day</div></div>
      <div class="actions"><button class="btn btn-quiet btn-sm">Skip</button><button class="btn btn-primary btn-sm">Taken</button></div></div></div>
  </div>
  <div class="slot"><h3>{icon("sun", "i i-sm")} Midday · 13:00</h3>
    <div class="card"><div class="med"><span class="cat cat-meds">{icon("pill")}</span>
      <div class="grow"><div class="name">Iron supplement</div><div class="card-sub">14 mg · 1 capsule · {icon("repeat", "i i-xs")} Mon, Wed, Fri</div></div>
      <span class="status st-late">{icon("clock-alert", "i i-sm")} Late · 13:40</span></div></div>
  </div>
  <div class="slot"><h3>{icon("moon-star", "i i-sm")} Evening · 20:00</h3>
    <div class="card"><div class="med"><span class="cat cat-meds">{icon("pill")}</span>
      <div class="grow"><div class="name">Magnesium</div><div class="card-sub">250 mg · 1 tablet · {icon("repeat", "i i-xs")} until 31 Oct</div></div>
      <span class="muted small">Upcoming</span></div></div>
  </div>
  <div class="slot"><h3>{icon("clock", "i i-sm")} When needed</h3>
    <div class="card"><div class="list-row" style="padding:0"><span class="cat cat-meds">{icon("pill")}</span>
      <div style="flex:1"><div style="font-weight:600">Ibuprofen</div><div class="card-sub">200 mg · tablet · as needed · last: Thursday</div></div>
      <button class="btn btn-soft btn-sm">Log dose</button></div></div>
  </div>

  <div class="remind">{icon("bell")}<div style="flex:1"><div style="font-weight:600">Reminders on this phone</div>
    <div class="card-sub">08:00, 13:00 and 20:00. Notifications only say "Time for a check-in", never what you take.</div></div>
    <span class="toggle" role="switch" aria-checked="true" aria-label="Reminders"></span></div>
</main>
{tabbar("meds")}
"""
    return page("Medication", body, css)


def trends():
    W, H = 311, 120
    mood = series([3, 4, 3, 2, 4, 4, 5], W, H, 1, 5)
    energy = series([3, 3, 2, 2, 3, 4, 4], W, H, 1, 5)
    sleep = [7.3, 6.5, 8.1, 5.9, 7.0, 7.8, 8.4]
    wt = [73.0, 72.9, 73.1, 72.8, 72.9, 72.7, 72.8, 72.6, 72.7, 72.5, 72.6, 72.6, 72.4, 72.5, 72.4]
    wpts = series(wt, 120, 44, 72.2, 73.3, 3)
    grid = "".join(f'<line x1="0" x2="{W}" y1="{y:.1f}" y2="{y:.1f}" class="grid"/>' for y in [6 + (H - 12) * k / 4 for k in range(5)])
    days = "".join(f"<span>{d}</span>" for d in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    bars = "".join(
        f'<rect x="{6 + i * 44.5:.1f}" y="{90 - h * 9:.1f}" width="26" height="{h * 9:.1f}" rx="7" class="bar{" now" if i == 6 else ""}"/>'
        for i, h in enumerate(sleep))
    css = BODY_CSS + """
.chart { display: block; width: 100%; height: auto; margin-top: var(--sp-3); overflow: visible; }
.chart .grid { stroke: var(--line); stroke-width: 1; stroke-dasharray: 2 4; }
.chart .l1 { fill: none; stroke: var(--feel-ink); stroke-width: 3; stroke-linecap: round; }
.chart .l2 { fill: none; stroke: var(--food-ink); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 1 6; }
.chart .dot { fill: var(--surface); stroke: var(--feel-ink); stroke-width: 2.5; }
.chart .bar { fill: var(--sleep-tint); } .chart .bar.now { fill: var(--sleep-ink); }
.xaxis { display: flex; justify-content: space-between; font-size: var(--fs-caption); color: var(--text-3); margin-top: 6px; padding: 0 2px; }
.legend { display: flex; gap: var(--sp-4); font-size: var(--fs-footnote); color: var(--text-2); margin-top: 4px; }
.legend i { display: inline-block; width: 14px; height: 4px; border-radius: 2px; vertical-align: middle; margin-right: 6px; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); margin-top: var(--sp-3); }
.split .card { margin: 0; }
.big { font-size: var(--fs-title2); font-weight: var(--fw-bold); }
.heat { display: flex; gap: var(--sp-4); align-items: center; }
.heat-legend { display: flex; gap: 2px; margin: 6px 0 2px; }
.heat-legend span { flex: 1; height: 8px; border-radius: 3px; }
.gut { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: var(--sp-3); }
.gcol { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.gdots { display: flex; flex-direction: column-reverse; gap: 4px; min-height: 60px; justify-content: flex-start; }
.gdots span { width: 28px; height: 28px; border-radius: 50%; background: var(--gut-tint); color: var(--gut-ink); display: grid; place-items: center;
  font-size: var(--fs-footnote); font-weight: var(--fw-bold); }
.gd { font-size: var(--fs-caption); color: var(--text-3); }
.after { display: flex; gap: var(--sp-3); padding: 10px 0; border-top: 1px solid var(--line); margin-top: 10px; font-size: var(--fs-callout); }
.after > div:first-child { flex: 1; display: flex; flex-direction: column; } .after span { color: var(--text-2); font-size: var(--fs-footnote); }
.after .then { flex: 1; font-size: var(--fs-footnote); }
"""
    heat = {"knee-right": 6, "lower-abdomen": 3, "head": 2, "shoulder-left": 2, "forearm-right": 1, "neck": 1}
    body = f"""
<main class="content">
  <header class="page-head"><h1 class="large-title">Trends</h1><button class="icon-btn" aria-label="Choose period">{icon("calendar")}</button></header>
  <div class="segmented" role="tablist"><button class="on" role="tab" aria-selected="true">Week</button><button role="tab">Month</button><button role="tab">3 months</button><button role="tab">Year</button></div>

  <section class="card" style="margin-top:var(--sp-4)">
    <div class="card-title">Mood &amp; energy</div><div class="card-sub">12–18 October</div>
    <svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label="Mood and energy over the week; mood 3 on Monday rising to 5 on Sunday">
      {grid}<path d="{smooth_path(energy)}" class="l2"/><path d="{smooth_path(mood)}" class="l1"/>
      <circle cx="{mood[-1][0]:.1f}" cy="{mood[-1][1]:.1f}" r="5" class="dot"/></svg>
    <div class="xaxis">{days}</div>
    <div class="legend"><span><i style="background:var(--feel-ink)"></i>Mood</span><span><i style="background:var(--food-ink)"></i>Energy</span></div>
  </section>

  <div class="split">
    <section class="card"><div class="card-sub">Sleep, avg</div><div class="big">7 h 17 m</div>
      <svg class="chart" viewBox="0 0 {W} 92" style="margin-top:8px" role="img" aria-label="Sleep hours per night">{bars}</svg></section>
    <section class="card"><div class="card-sub">Weight</div><div class="big">72.4 <span class="small muted">kg</span></div>
      <svg class="chart" viewBox="0 0 120 44" role="img" aria-label="Weight over 15 days"><path d="{smooth_path(wpts)}" fill="none" stroke="var(--measure-ink)" stroke-width="2.5" stroke-linecap="round"/></svg>
      <div class="card-sub">−0.6 kg in 15 days</div></section>
  </div>

  <section class="card" style="margin-top:var(--sp-3)">
    <div class="card-title">Where it hurt</div><div class="card-sub">Times logged and average intensity, last 30 days</div>
    <div class="heat" style="margin-top:var(--sp-3)">
      {body_svg(fills=heat, width=96, label="Heat map, front view")}
      <div style="flex:1">
        <div style="font-weight:600">Your right knee</div><div class="card-sub">9 times · average 4.2 of 10</div>
        <div style="font-weight:600; margin-top:var(--sp-3)">Lower abdomen</div><div class="card-sub">4 times · average 3.0 of 10</div>
        <div class="heat-legend" aria-hidden="true">{"".join(f'<span style="background:var(--heat-{k})"></span>' for k in range(7))}</div>
        <div class="xaxis" style="padding:0;margin:0"><span>Less often</span><span>More</span></div>
      </div>
    </div>
  </section>

  <section class="card" style="margin-top:var(--sp-3)">
    <div class="card-title">{icon("toilet", "i i-sm")} Bowel movements</div><div class="card-sub">7 this week · type per visit</div>
    <div class="gut"><div class="gcol"><div class="gdots"><span title="Type 4">4</span></div><span class="gd">Mon</span></div><div class="gcol"><div class="gdots"><span title="Type 3">3</span></div><span class="gd">Tue</span></div><div class="gcol"><div class="gdots"><span title="Type 4">4</span><span title="Type 5">5</span></div><span class="gd">Wed</span></div><div class="gcol"><div class="gdots"></div><span class="gd">Thu</span></div><div class="gcol"><div class="gdots"><span title="Type 2">2</span></div><span class="gd">Fri</span></div><div class="gcol"><div class="gdots"><span title="Type 4">4</span></div><span class="gd">Sat</span></div><div class="gcol"><div class="gdots"><span title="Type 4">4</span></div><span class="gd">Sun</span></div></div>
  </section>

  <section class="card" style="margin-top:var(--sp-3)">
    <div class="card-title">{icon("wheat", "i i-sm")} After meals with gluten</div>
    <div class="card-sub">Your own entries side by side, from the 24 hours after each meal. The app doesn't draw conclusions.</div>
    <div class="after"><div><b>Thu 15 · Lunch</b><span>Pasta salad, eating out</span></div><div class="then">Bloated (2) at 16:10<br>Bowel type 6 at 19:30</div></div>
    <div class="after"><div><b>Sun 11 · Dinner</b><span>Pizza</span></div><div class="then muted">Nothing logged</div></div>
  </section>

  <button class="btn btn-soft btn-block" style="margin-top:var(--sp-4)">{icon("file-down")} Doctor visit summary (PDF)</button>
</main>
{tabbar("trends")}
"""
    return page("Trends", body, css)


def recovery():
    css = """
.steps { display: flex; gap: 6px; justify-content: center; margin: var(--sp-2) 0 var(--sp-5); }
.steps i { width: 28px; height: 5px; border-radius: 3px; background: var(--surface-3); }
.steps i.on { background: var(--primary); }
.hero { width: 80px; height: 80px; margin: 0 auto var(--sp-4); border-radius: 34px; display: grid; place-items: center;
  background: var(--primary-soft); color: var(--primary-press); transform: rotate(-6deg); }
.hero .i { width: 40px; height: 40px; transform: rotate(6deg); stroke-width: 1.6; }
.key { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: var(--sp-5) 0 var(--sp-3); }
.key span { font-family: var(--font-mono); font-size: 1.0625rem; font-weight: 600; letter-spacing: .08em; text-align: center;
  padding: 10px 0; border-radius: var(--r-sm); background: var(--surface); box-shadow: var(--shadow-1); }
.warn { display: flex; gap: var(--sp-3); padding: var(--sp-4); border-radius: var(--r-lg); background: var(--note-tint); color: var(--note-ink);
  font-size: var(--fs-callout); margin-top: var(--sp-4); }
.warn b { color: var(--text); }
"""
    groups = "7KQ2 M9XA 4FJT R8WC 2HDN V6PE 3ZBY Q5GS".split()
    body = f"""
<main class="content" style="padding-top:var(--sp-2); padding-bottom:var(--sp-7)">
  <div class="steps" aria-label="Step 3 of 4"><i class="on"></i><i class="on"></i><i class="on"></i><i></i></div>
  <div class="hero">{icon("key-round")}</div>
  <h1 class="large-title" style="text-align:center">Your recovery key</h1>
  <p class="muted" style="text-align:center; margin-top:var(--sp-3)">This is the only spare key to your diary. Keep it somewhere safe and offline,
    such as printed in a drawer or in a password manager.</p>
  <div class="key" aria-label="Recovery key">{"".join(f"<span>{g}</span>" for g in groups)}</div>
  <div style="display:flex; gap:var(--sp-3)"><button class="btn btn-quiet" style="flex:1">{icon("printer", "i i-sm")} Print</button>
    <button class="btn btn-quiet" style="flex:1">{icon("copy", "i i-sm")} Copy</button></div>
  <div class="warn">{icon("info")}<p><b>Nobody else can unlock your diary.</b> If you lose both your passphrase and this key,
    your entries are gone for good, and the person running this server can't get them back either.</p></div>
  <button class="btn btn-primary btn-block" style="margin-top:var(--sp-5)">I've stored it. Check me</button>
  <p class="small muted" style="text-align:center; margin-top:var(--sp-3)">Next, you'll type two groups from the key to confirm.</p>
</main>
"""
    return page("Recovery key", body, css)


def system():
    css = BODY_CSS + """
.wrap { padding: var(--sp-4) var(--gutter) var(--sp-8); }
h2 { font-size: var(--fs-title3); margin: var(--sp-7) 0 var(--sp-3); }
.sw { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.sw div { border-radius: var(--r-md); height: 64px; padding: 6px 8px; font-size: 10px; font-family: var(--font-mono); display: flex;
  align-items: flex-end; box-shadow: inset 0 0 0 1px var(--line); }
.cats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.cats div { border-radius: var(--r-md); padding: 10px 8px; font-size: var(--fs-footnote); font-weight: 600; display: flex; flex-direction: column; gap: 6px; }
.ramp7 { display: flex; gap: 3px; } .ramp7 span { flex: 1; height: 28px; border-radius: 6px; }
.type p { margin: 6px 0; }
.space { display: flex; align-items: flex-end; gap: 10px; }
.space div { background: var(--primary); opacity: .75; border-radius: 3px; width: 100%; }
.space-l { display: flex; gap: 10px; font-size: 10px; color: var(--text-3); font-family: var(--font-mono); }
.space-l span { width: 100%; text-align: center; }
.icons { display: grid; grid-template-columns: repeat(8, 1fr); gap: 10px; color: var(--text); }
.icons .i { width: 26px; height: 26px; }
.motion { font-size: var(--fs-callout); } .motion li { margin: 6px 0; }
.demo { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
"""
    def sw(var, fg="var(--text)"):
        return f'<div style="background:var(--{var});color:{fg}">--{var}</div>'
    swatches = "".join([sw("bg"), sw("surface"), sw("surface-2"), sw("surface-3"), sw("text", "var(--bg)"), sw("text-2", "var(--bg)"),
                        sw("primary", "var(--on-primary)"), sw("primary-soft", "var(--primary-press)")])
    cats = "".join(f'<div class="cat-{c}">{icon(i)}{n}</div>' for c, i, n in
                   [("food", "utensils", "Food"), ("feel", "smile", "Feeling"), ("sleep", "bed", "Sleep"), ("measure", "ruler", "Measure"),
                    ("pain", "activity", "Pain"), ("meds", "pill", "Meds"), ("gut", "toilet", "Bowel"), ("note", "notebook-pen", "Note")])
    icons = "".join(icon(n) for n in ["house", "chart-spline", "pill", "user-round", "utensils", "smile", "bed", "ruler",
                                       "activity", "weight", "thermometer", "heart-pulse", "bell", "lock", "key-round", "shield-check",
                                       "search", "calendar", "camera", "tag", "printer", "file-down", "undo-2", "settings"])
    sizes = [4, 8, 12, 16, 20, 24, 32, 40, 56]
    body = f"""
<main class="wrap">
  <p class="eyebrow">Design direction · proposal</p>
  <h1 class="large-title">Linen &amp; Clay</h1>
  <p class="muted" style="margin-top:8px">Warm paper tones, one confident clay accent, soft category tints. Calm, private, a little bit cosy.
    Not clinical.</p>

  <h2>Core palette</h2><div class="sw">{swatches}</div>
  <h2>Category tints</h2><div class="cats">{cats}</div>
  <p class="small muted" style="margin-top:8px">Tints identify <i>what</i> an entry is. They never judge a value. No red or green for "bad" or "good".</p>
  <h2>Intensity &amp; heat ramp</h2>
  <div class="ramp7">{"".join(f'<span style="background:var(--heat-{k})"></span>' for k in range(7))}</div>
  <p class="small muted" style="margin-top:8px">Peach to plum, readable for common colour-vision differences. Numbers are always shown too.</p>

  <h2>Type: system rounded</h2>
  <div class="type">
    <p style="font-size:var(--fs-display);font-weight:700;line-height:1.1">Display 36</p>
    <p style="font-size:var(--fs-title1);font-weight:700">Title 30 bold</p>
    <p style="font-size:var(--fs-title3);font-weight:700">Title 20 bold</p>
    <p style="font-size:var(--fs-body)">Body 17: Slept well, light walk before breakfast.</p>
    <p style="font-size:var(--fs-callout)" class="muted">Callout 16: secondary information</p>
    <p style="font-size:var(--fs-footnote)" class="muted">Footnote 14 · Caption 13</p>
    <p style="font-family:var(--font-mono)">7KQ2 M9XA 4FJT: mono for keys</p>
  </div>
  <p class="small muted">SF Pro Rounded on iPhone and Mac, Segoe UI on Windows. Zero font bytes, with Dynamic Type built in.</p>

  <h2>Spacing (4-pt) &amp; radii</h2>
  <div class="space">{"".join(f'<div style="height:{s}px"></div>' for s in sizes)}</div>
  <div class="space-l">{"".join(f"<span>{s}</span>" for s in sizes)}</div>
  <div class="demo" style="margin-top:var(--sp-4)">
    <span class="chip">Chip r10</span><button class="btn btn-primary btn-sm">Button r14</button>
    <span class="card" style="padding:10px 14px">Card r22</span></div>

  <h2>Icons: Lucide (ISC), 1.85 stroke</h2><div class="icons">{icons}</div>

  <h2>Components</h2>
  <div class="demo"><button class="btn btn-primary">Save</button><button class="btn btn-soft">Taken</button><button class="btn btn-quiet">Skip</button>
    <button class="btn btn-quiet focus-ring">Focused</button></div>
  <div class="demo" style="margin-top:10px"><span class="chip on">Aching</span><span class="chip">Sharp</span><span class="chip">#home</span></div>
  <div class="segmented" style="margin-top:10px"><button class="on">Week</button><button>Month</button><button>Year</button></div>

  <h2>Motion</h2>
  <ul class="motion">
    <li><b>Quick and quiet:</b> 120 ms press, 200 ms fades, 280 ms sheets, ease-out.</li>
    <li><b>Sheets slide up</b> from the "+" button; they never pop in from nowhere.</li>
    <li><b>Confirm by change, not celebration:</b> a soft check morph, no confetti.</li>
    <li><b>Undo toasts</b> slide in for 5 s instead of "Are you sure?" dialogs.</li>
    <li><b>Reduced motion:</b> all movement becomes a short cross-fade.</li>
  </ul>
</main>
"""
    return page("Design system", body, css, long=True)


SHEET_PAGE_CSS = """
.tri { display: flex; align-items: center; gap: var(--sp-3); padding: 6px 0; }
.tri .what { flex: 1; display: flex; align-items: center; gap: 10px; font-weight: var(--fw-semibold); }
.tri .segmented { flex: none; width: 190px; } .tri .segmented button { min-height: 34px; font-size: var(--fs-footnote); }
.tri .segmented button.yes { background: var(--food-tint); color: var(--food-ink); font-weight: var(--fw-bold); box-shadow: none; }
.row2 { display: flex; gap: var(--sp-2); }
.row2 .btn { flex: 1; }
"""


def sheet_page(title, head_title, time_label, inner, css=""):
    body = f"""
<div class="scrim" style="background:var(--bg)"></div>
<section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh" style="top:52px; overflow:hidden">
  <div class="grabber"></div>
  <div class="sheet-head" style="margin-bottom:var(--sp-2)"><button class="icon-btn" aria-label="Back">{icon("chevron-left")}</button>
    <h2 id="sh" style="flex:1; margin-left:4px">{head_title}</h2><span class="time-chip">{icon("clock", "i i-sm")} {time_label}</span></div>
  {inner}
</section>
"""
    return page(title, body, SHEET_PAGE_CSS + css)


def log_meal():
    meal_types = "".join(f'<span class="chip{" on" if m == "Breakfast" else ""}">{m}</span>' for m in ["Breakfast", "Lunch", "Dinner", "Snack", "Drink"])
    saved = "".join(f'<span class="chip">{icon("bookmark", "i i-sm")} {m}</span>' for m in ["Oatmeal", "Rye bread &amp; cheese", "Smoothie"])

    def tri(ic, name, sel):
        opts = "".join(f'<button class="{("on" if o == sel else "") + (" yes" if o == sel == "Yes" else "")}">{o}</button>' for o in ["No", "Not sure", "Yes"])
        return f'<div class="tri"><span class="what"><span class="cat cat-food" style="width:32px;height:32px;border-radius:10px">{icon(ic, "i i-sm")}</span>{name}</span><div class="segmented">{opts}</div></div>'
    inner = f"""
  <div class="scroll-row">{meal_types}</div>
  <p class="label">Eat it often? <span class="hint">saved meals fill everything in</span></p>
  <div class="scroll-row">{saved}</div>
  <p class="label">What did you have?</p>
  <div class="field" style="color:var(--text); padding-right:6px"><span style="flex:1">Oatmeal with berries and yoghurt</span>
    <button class="icon-btn" aria-label="Add photo">{icon("camera")}</button><button class="icon-btn" aria-label="Tags">{icon("tag")}</button></div>
  <p class="label">Your watch list <span class="hint">you choose what to track</span></p>
  {tri("wheat", "Gluten", "No")}
  {tri("milk", "Lactose", "Yes")}
  {tri("bean", "FODMAP", "Not sure")}
  <span class="chip" style="margin-top:6px; color:var(--primary-press)">{icon("plus", "i i-sm")} Track something else</span>
  <p class="label">Where</p>
  <div class="chip-row"><span class="chip on">{icon("house", "i i-sm")} Home</span><span class="chip">{icon("store", "i i-sm")} Eating out</span><span class="chip">Takeaway</span></div>
  <button class="btn btn-primary btn-block" style="margin-top:var(--sp-5)">Save</button>
"""
    return sheet_page("Log meal", "Meal", "08:10", inner)


STOOL_SHAPES = {
    1: '<circle cx="10" cy="14" r="4"/><circle cx="20" cy="11" r="3.5"/><circle cx="29" cy="15" r="4"/><circle cx="18" cy="20" r="3"/>',
    2: '<path d="M6 15c0-4 3-6 6-5 2-3 6-3 8 0 3-2 7-1 8 2 3 1 4 5 2 7-1 3-5 3-7 2-2 2-6 2-8 0-3 1-7 0-9-6z"/>',
    3: '<rect x="5" y="9" width="30" height="11" rx="5.5"/><path d="M13 9v3M20 20v-3M27 9v3" stroke="var(--gut-tint)" stroke-width="1.6"/>',
    4: '<path d="M6 17c4-7 10-7 14-3s10 4 14-3" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>',
    5: '<ellipse cx="10" cy="15" rx="5" ry="4"/><ellipse cx="21" cy="12" rx="5" ry="4"/><ellipse cx="30" cy="17" rx="5" ry="4"/>',
    6: '<path d="M5 18c2-6 6-4 8-7 3 3 5-1 8 2 2-3 6-1 7 1 3 0 6 2 6 5-4 3-25 3-29-1z"/>',
    7: '<path d="M12 6c3 5 5 7 5 10a5 5 0 0 1-10 0c0-3 2-5 5-10zM27 9c2.5 4 4 6 4 8.5a4 4 0 0 1-8 0c0-2.5 1.5-4.5 4-8.5z"/>',
}
STOOL_LABELS = {1: "Hard lumps", 2: "Lumpy", 3: "Cracked", 4: "Smooth", 5: "Soft pieces", 6: "Mushy", 7: "Watery"}


def stool_svg(k):
    return f'<svg viewBox="0 0 40 26" width="44" height="28" fill="currentColor" aria-hidden="true">{STOOL_SHAPES[k]}</svg>'


def log_bowel():
    css = """
.types { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.types button { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 2px 8px; border-radius: var(--r-md);
  background: var(--surface-2); color: var(--gut-ink); font-size: var(--fs-caption); }
.types button b { color: var(--text); font-size: var(--fs-callout); }
.types button span { color: var(--text-2); }
.types button.on { background: var(--gut-tint); box-shadow: inset 0 0 0 2px var(--gut-ink); }
"""
    types = "".join(f'<button class="{"on" if k == 4 else ""}" aria-label="Type {k}, {STOOL_LABELS[k]}">{stool_svg(k)}<b>{k}</b><span>{STOOL_LABELS[k]}</span></button>' for k in range(1, 8))
    extras = "".join(f'<span class="chip">{x}</span>' for x in ["Urgent", "Straining", "Pain", "Not finished", "Blood seen", "Mucus"])
    inner = f"""
  <p class="label" style="margin-top:0">Type <span class="hint">based on the Bristol scale</span></p>
  <div class="types">{types}</div>
  <p class="label">Anything else? <span class="hint">optional</span></p>
  <div class="chip-row">{extras}</div>
  <p class="label">Note</p>
  <div class="field">Optional</div>
  <button class="btn btn-primary btn-block" style="margin-top:var(--sp-5)">Save</button>
  <p class="footnote-lock">{icon("lock", "i i-sm")} Only you can see this. Not even the server can.</p>
"""
    return sheet_page("Log bowel movement", "Bowel movement", "07:40", inner, css)


def log_sleep():
    css = """
.sum { text-align: center; padding: var(--sp-2) 0 var(--sp-4); }
.sum .big { font-size: var(--fs-display); font-weight: var(--fw-bold); line-height: 1.1; }
.times { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); }
.tcard { background: var(--sleep-tint); color: var(--sleep-ink); border-radius: var(--r-lg); padding: var(--sp-3) var(--sp-4); }
.tcard .v { font-size: var(--fs-title2); font-weight: var(--fw-bold); color: var(--text); }
.tcard .k { display: flex; gap: 6px; align-items: center; font-size: var(--fs-footnote); font-weight: var(--fw-semibold); }
.scale { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.scale button { height: 46px; border-radius: var(--r-md); background: var(--surface-2); color: var(--text-2); font-weight: var(--fw-semibold); }
.scale button.on { background: var(--sleep-tint); color: var(--sleep-ink); box-shadow: inset 0 0 0 2px var(--sleep-ink); }
.ends { display: flex; justify-content: space-between; font-size: var(--fs-caption); color: var(--text-3); margin-top: 4px; }
"""
    q = "".join(f'<button class="{"on" if k == 4 else ""}" aria-label="Quality {k} of 5">{k}</button>' for k in range(1, 6))
    woke = "".join(f'<button class="{"on" if w == "1" else ""}">{w}</button>' for w in ["0", "1", "2", "3+"])
    inner = f"""
  <div class="sum"><div class="big">7 h 20 min</div><div class="muted small">Last night · filled in from your usual times</div></div>
  <div class="times">
    <div class="tcard"><div class="k">{icon("moon", "i i-sm")} Fell asleep</div><div class="v">23:50</div><div class="small">Saturday</div></div>
    <div class="tcard"><div class="k">{icon("sunrise", "i i-sm")} Woke up</div><div class="v">07:10</div><div class="small">Sunday</div></div>
  </div>
  <p class="label">How did you sleep?</p>
  <div class="scale">{q}</div>
  <div class="ends"><span>Restless</span><span>Rested</span></div>
  <p class="label">Woke up during the night</p>
  <div class="segmented">{woke}</div>
  <div class="row2" style="margin-top:var(--sp-4)"><button class="btn btn-quiet">{icon("plus", "i i-sm")} Nap</button><button class="btn btn-quiet">{icon("notebook-pen", "i i-sm")} Note</button></div>
  <button class="btn btn-primary btn-block" style="margin-top:var(--sp-3)">Save</button>
"""
    return sheet_page("Log sleep", "Sleep", "Last night", inner, css)


def log_weight():
    css = """
.value { display: flex; align-items: center; justify-content: space-between; margin: var(--sp-5) 0 var(--sp-2); }
.value .num { font-size: 3.4rem; font-weight: var(--fw-bold); letter-spacing: -0.02em; line-height: 1; }
.value .num small { font-size: var(--fs-title3); color: var(--text-2); font-weight: var(--fw-semibold); margin-left: 4px; }
.step { width: 56px; height: 56px; border-radius: var(--r-full); background: var(--measure-tint); color: var(--measure-ink); display: grid; place-items: center; }
.step .i { width: 26px; height: 26px; }
.keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: var(--sp-4); }
.keypad button { height: 48px; border-radius: var(--r-md); background: var(--surface-2); font-size: var(--fs-title3); font-weight: var(--fw-semibold); }
"""
    kinds = "".join(f'<span class="chip{" on" if k == "Weight" else ""}">{k}</span>' for k in ["Weight", "Blood pressure", "Temperature", "Waist"])
    ctx = "".join(f'<span class="chip{" on" if c == "Morning" else ""}">{c}</span>' for c in ["Morning", "Before breakfast", "After exercise"])
    keys = "".join(f"<button>{k}</button>" for k in ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"])
    inner = f"""
  <div class="scroll-row">{kinds}<span class="chip" style="color:var(--primary-press)">{icon("plus", "i i-sm")} New type</span></div>
  <div class="value"><button class="step" aria-label="Minus 0.1">{icon("minus")}</button>
    <div class="num" aria-live="polite">72.4<small>kg</small></div>
    <button class="step" aria-label="Plus 0.1">{icon("plus")}</button></div>
  <p class="muted small" style="text-align:center">Last time: 72.6 kg on Thursday</p>
  <p class="label">When</p>
  <div class="chip-row">{ctx}</div>
  <div class="keypad" aria-hidden="true">{keys}</div>
  <button class="btn btn-primary btn-block" style="margin-top:var(--sp-3)">Save</button>
"""
    return sheet_page("Log weight", "Measurement", "07:25", inner, css)


def med_edit():
    css = """
.form-row { display: flex; gap: var(--sp-2); }
.form-row .field { flex: 1; }
.timerow { display: flex; align-items: center; gap: var(--sp-3); padding: 10px 0; }
.timerow + .timerow { border-top: 1px solid var(--line); }
.timerow .t { font-size: var(--fs-title3); font-weight: var(--fw-bold); width: 68px; }
.timerow .grow { flex: 1; color: var(--text-2); }
.toggle { width: 51px; height: 31px; border-radius: 16px; background: var(--meds-ink); position: relative; flex: none; }
.toggle::after { content: ""; position: absolute; right: 2px; top: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: var(--shadow-1); }
.toggle.off { background: var(--surface-3); } .toggle.off::after { right: auto; left: 2px; }
.setrow { display: flex; align-items: center; gap: var(--sp-3); padding: 12px 0; }
.setrow + .setrow { border-top: 1px solid var(--line); }
.setrow .grow { flex: 1; } .setrow .v { color: var(--text-2); display: flex; align-items: center; gap: 4px; }
"""
    forms = "".join(f'<span class="chip{" on" if f == "Tablet" else ""}">{f}</span>' for f in ["Tablet", "Capsule", "Liquid", "Drops", "Spray", "Inhaler", "Patch", "Other"])
    often = "".join(f'<span class="chip{" on" if f == "Every day" else ""}">{f}</span>' for f in ["Every day", "Some weekdays", "Every few days", "As needed"])
    body = f"""
<main class="content">
  <div class="nav-head"><button class="btn btn-sm" style="color:var(--primary-press)">Cancel</button>
    <span class="title">New medication</span><button class="btn btn-sm" style="color:var(--primary-press); font-weight:700">Save</button></div>
  <p class="label">Name</p>
  <div class="field" style="color:var(--text)">Vitamin D</div>
  <p class="label">Strength <span class="hint">as on the package</span></p>
  <div class="form-row"><div class="field" style="color:var(--text)">20</div>
    <div class="field" style="color:var(--text); flex:0 0 110px; justify-content:space-between">µg {icon("chevron-down", "i i-sm")}</div></div>
  <p class="label">Form</p>
  <div class="scroll-row">{forms}</div>
  <p class="label">How often</p>
  <div class="chip-row">{often}</div>
  <p class="label">Times and amount <span class="hint">as you were told to take it</span></p>
  <div class="card" style="padding-top:4px; padding-bottom:4px">
    <div class="timerow"><span class="t">08:00</span><span class="grow">1 tablet</span>{icon("x", "i i-sm")}</div>
    <div class="timerow" style="color:var(--primary-press); font-weight:600">{icon("plus", "i i-sm")} Add a time</div>
  </div>
  <div class="card" style="margin-top:var(--sp-4); padding-top:4px; padding-bottom:4px">
    <div class="setrow"><span class="grow">Starts</span><span class="v">Today {icon("chevron-right", "i i-sm")}</span></div>
    <div class="setrow"><span class="grow">Ends</span><span class="v">No end date {icon("chevron-right", "i i-sm")}</span></div>
    <div class="setrow"><span class="grow">Remind me on this phone</span><span class="toggle" role="switch" aria-checked="true" aria-label="Reminders"></span></div>
  </div>
  <p class="small muted" style="margin-top:var(--sp-3)">Once saved, it shows up on Today at the right times, so you only tap "Taken". You enter the amount;
    the app never calculates or suggests doses.</p>
</main>
"""
    return page("New medication", body, css)


SCREENS = {
    "today": today, "quicklog": quicklog, "log-feeling": log_feeling, "bodymap": bodymap,
    "log-meal": log_meal, "log-bowel": log_bowel, "log-sleep": log_sleep, "log-weight": log_weight,
    "meds": meds, "med-edit": med_edit, "trends": trends, "onboarding-recovery": recovery, "system": system,
}

if __name__ == "__main__":
    for name, fn in SCREENS.items():
        (OUT / f"{name}.html").write_text(fn())
        print("wrote", f"design/{name}.html")
