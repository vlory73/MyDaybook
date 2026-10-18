"""Check WCAG contrast of key token pairs in design/tokens.css. Usage: python3 design/tools/contrast.py"""
import re, pathlib

css = pathlib.Path(__file__).resolve().parents[1].joinpath("tokens.css").read_text()
light_part, dark_part = css.split("@media (prefers-color-scheme: dark)")
def tokens(block):
    return {k: v for k, v in re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})", block)}
L, D = tokens(light_part), {**tokens(light_part), **tokens(dark_part)}

def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

PAIRS = [("text", "bg", 4.5), ("text", "surface", 4.5), ("text-2", "bg", 4.5), ("text-2", "surface-2", 4.5),
         ("text-3", "surface", 3.0), ("primary", "surface", 4.5), ("primary", "bg", 4.5),
         ("on-primary", "primary", 4.5), ("primary-press", "primary-soft", 4.5)]
PAIRS += [(f"{c}-ink", f"{c}-tint", 4.5) for c in ("food", "feel", "sleep", "measure", "pain", "meds", "note")]
PAIRS += [("heat-6", "surface", 3.0)]

print("| Pair | Light | Dark | Needs |\n| --- | --- | --- | --- |")
ok = True
for fg, bg, need in PAIRS:
    l, d = ratio(L[fg], L[bg]), ratio(D[fg], D[bg])
    ok &= l >= need and d >= need
    flag = lambda r: f"{r:.1f}" + ("" if r >= need else " ✗")
    print(f"| `{fg}` on `{bg}` | {flag(l)} | {flag(d)} | {need} |")
print("\nAll pass" if ok else "\nFAILURES above")
