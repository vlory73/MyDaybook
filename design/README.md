# Design proposal: "Linen & Clay"

Status: **proposal (M0)**, waiting for owner approval (decision D16 in [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)).
Static HTML mockups only; no app code. All data shown is synthetic.

## Direction in one paragraph

Warm paper tones (linen, oat), one confident **clay** accent for actions, and soft pastel **category tints** so you can
tell a meal from a pain entry at a glance. Big friendly type, rounded shapes, and generous spacing. It should feel like a
journal, not a chart: no clinical blues, no red/green value judgements, no reference ranges (that also keeps us clear of
MDR "diagnostic insight").

## Screens

Each screen is a 375 × 812 frame (iPhone 13 mini/SE width class), captured at 2× in light and dark mode.
Screens that scroll also have a `-full` capture.

| Screen | File | Light | Dark | What it shows |
| --- | --- | --- | --- | --- |
| Today | [today.html](today.html) | [png](screenshots/today-light.png) · [full](screenshots/today-light-full.png) | [png](screenshots/today-dark.png) | Greeting, week strip, **one-tap mood check-in**, medication due now, timeline, **undo toast** instead of a confirmation, bottom nav with central "+" |
| Quick-log sheet | [quicklog.html](quicklog.html) | [png](screenshots/quicklog-light.png) | [png](screenshots/quicklog-dark.png) | Six large tiles, time defaulting to "now", **one-tap repeats of recent entries**, encryption reassurance |
| Log feeling | [log-feeling.html](log-feeling.html) | [png](screenshots/log-feeling-light.png) | [png](screenshots/log-feeling-dark.png) | Mood, energy and stress 1–5 in three taps plus Save; "last time" hints; own symptom tags with severity |
| Body map | [bodymap.html](bodymap.html) | [png](screenshots/bodymap-light.png) | [png](screenshots/bodymap-dark.png) | Segmented neutral outline, **"your right / your left"** labels, Find (searchable region list), Head/Hands/Feet zoom, intensity 0–10 with numbers, quality chips, multiple points per entry |
| Medication | [meds.html](meds.html) | [png](screenshots/meds-light.png) · [full](screenshots/meds-light-full.png) | [png](screenshots/meds-dark.png) | Today's doses by time slot, taken / skipped / late, "when needed" medications, opt-in reminders with generic text explained. No dose advice anywhere |
| Trends | [trends.html](trends.html) | [png](screenshots/trends-light.png) · [full](screenshots/trends-light-full.png) | [png](screenshots/trends-dark.png) | Mood and energy curves, sleep bars, weight sparkline (neutral, with no target or range), **body heat map**, doctor-visit PDF |
| Onboarding: recovery key | [onboarding-recovery.html](onboarding-recovery.html) | [png](screenshots/onboarding-recovery-light.png) | [png](screenshots/onboarding-recovery-dark.png) | Plain-language explanation, key in 8 groups, print/copy, honest "nobody can get it back" warning, then confirmation by re-typing |
| Design system | [system.html](system.html) | [png](screenshots/system-light.png) | [png](screenshots/system-dark.png) | Palette, category tints, heat ramp, type, spacing, radii, icons, components, motion |

## Tokens

All values live in [`tokens.css`](tokens.css), and M1 ports them 1:1 into the app.

- **Colour:** linen `#faf6f0` background, warm ink `#2a2430` text, clay `#a94e2e` primary. Dark mode uses a warm near-black
  `#16131a` background with a lighter clay `#f08f68`. Seven category tint/ink pairs.
- **Heat ramp:** peach to plum in 7 steps, light to dark in light mode and reversed in dark mode, so "more" always means more contrast.
  Intensity is always shown as a number as well, never as colour alone.
- **Type:** system rounded stack (SF Pro Rounded on Apple, Segoe UI on Windows, Inter as a fallback). **Zero font bytes**,
  native Danish glyphs, and iOS Dynamic Type support via `font: -apple-system-body` and rem-based sizes.
  Scale: 13 / 14 / 16 / **17 body** / 20 / 23 / 30 / 36.
- **Spacing:** 4-pt scale (4, 8, 12, 16, 20, 24, 32, 40, 56). 16 px gutters. 44 px minimum touch targets.
- **Radii:** 10 (chips, inputs), 14 (buttons, tiles), 22 (cards), 28 (sheets).
- **Icons:** [Lucide](https://lucide.dev) (ISC), 1.85 stroke, rounded caps. Only the icons we use are vendored into
  [`assets/icons.svg`](assets/icons.svg). The five mood faces are original drawings (CC0).
- **Motion:** 120 ms press, 200 ms fades, 280 ms sheets, `cubic-bezier(.2,.8,.2,1)`. Sheets rise from the "+" button.
  Changes are confirmed quietly, with no confetti. Undo toasts last 5 s. With reduced motion, everything becomes a cross-fade.

### Contrast (WCAG 2.2 AA)

Output of `python3 design/tools/contrast.py`. Every pair passes in both themes:

| Pair | Light | Dark | Needs |
| --- | --- | --- | --- |
| text on bg | 14.0 | 16.2 | 4.5 |
| text-2 on bg | 6.5 | 9.1 | 4.5 |
| text-2 on surface-2 | 6.0 | 7.4 | 4.5 |
| primary on surface | 5.5 | 7.0 | 4.5 |
| on-primary on primary | 5.5 | 7.4 | 4.5 |
| primary-press on primary-soft | 6.0 | 6.9 | 4.5 |
| category ink on tint (all 7) | 5.6–6.2 | 7.9–9.0 | 4.5 |

## Interaction rules shown

- Bottom navigation with one prominent, thumb-reachable **"+"**.
- Common entries in 1–3 taps: mood is 1 tap from Today, a repeat meal is 2 taps, and a feeling check-in is 3 taps plus Save.
- Defaults: time = now; "last time" values highlighted; recent entries offered for one-tap repeats.
- **Undo instead of "Are you sure?"** for anything non-destructive.
- Body map sides are labelled from the user's perspective, because the front view mirrors them.

## Open design questions

1. **Fonts:** keep system fonts (the current proposal), or allow one OFL-licensed display font for headings (needs the licence
   exception, decision D6)?
2. **Body outline style:** the segmented "soft mannequin" shown here is easy to tap and gender-neutral. The final hand-built
   SVG (M4) will refine its proportions and add the back view, the zoomed head/hands/feet and the child variant. Do you want this style, or a
   continuous silhouette with invisible tap regions?
3. **Accent colour:** clay, or would you prefer a sage-green accent (calmer, but less energetic)?
4. **"Me" tab:** holds profile switching (dependents), export, settings, About and admin. Alternatively, put profile switching
   in the avatar on Today only.

## Regenerating

```sh
python3 design/tools/build_mockups.py   # writes design/*.html
node design/tools/screenshot.mjs         # needs the `playwright` package; writes design/screenshots/*.png
python3 design/tools/contrast.py         # contrast table
```
