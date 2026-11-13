# PupaCare Journey: design system v2, "Four dots, one paw"

Phone-only PWA that follows Apple's Human Interface Guidelines: large titles, grouped lists, segmented controls, bottom sheets,
a frosted floating tab bar, safe areas, 44pt touch targets and text that follows the phone's text-size setting (rem plus `-apple-system-body`).

## Colour
| Role | Fill | Text-safe shade | Tint |
|---|---|---|---|
| Red-orange: Today, main actions | `#EE5127` | `#C93A12` | `#FDE5DD` |
| Orchid: Log | `#B272A3` | `#874877` | `#F3E6F0` |
| Sunflower: Plan | `#FFC357` | `#9A6500` | `#FFF0D1` |
| Sky: Check, progress | `#50C1D6` | `#137E92` | `#DDF3F7` |
| Page | `#FFFBF2` (cream white) | | |
| Cards | `#FFFFFF` | | |
| Ink | `#1E1B2E`, `#48445A`, `#6B6678` | | |
| Safety only | `#B42318` on `#FDECEA` | | |

Rules:
- Text on a bright fill is always **ink**, never white (white on these fills is under 4.5:1).
- Sun and sky are never used as text or thin lines on cream; use the darker text-safe shade instead.
- Each tab sets `--accent`, `--accent-ink` and `--accent-tint` through `#app[data-section]`.

## Type
- **Outfit** 600/700 for titles; the iPhone system font for everything else.
- Sizes are in rem: Large Title 34, Title 24, Title 2 20, Headline/Body 17, Callout 16, Subhead 15, Footnote 13, Caption 12.

## Spacing and shape
- 4pt grid, 16pt side margins (14 below 360px wide), 16pt between blocks.
- Corner radii: cards 20, list rows 12, sheet 28, buttons and chips as pills.
- Only three container kinds: **card**, **grouped list** and **banner** (info, accent, warning, safety).

## Controls
- Buttons: primary, accent, tinted, soft, plain and danger.
- Segmented control for Yes / No / Not sure.
- Chips show a check mark when selected.
- Large "choice" rows for single picks.
- iOS-style switch; gradient itch slider.

## Backgrounds
Geometric scenery is drawn in code (circles, half-circles and pill shapes in the four colours), one scene per section.
- Shapes stay in the header band and the right third, so they never sit behind text.
- Scenes fade into cream and scroll at 0.35× for a gentle parallax.
- Check: the stepping stones fill in as you move through the steps.
- Motion is slow drift and "breathing" only, and it is turned off when the phone's reduce-motion setting is on.

## Motion
- Cards fade up in sequence.
- Progress bar fills; score bars grow; chart line draws in.
- The "now" stop on the trail pulses.
- Sheets slide up from the bottom.
- Completion moments burst into dots in the four colours (onboarding done, check result, check-in saved, log saved).
- Check-in suggestions appear one after another.

## Signature
The brand mark is a paw made of four coloured toe dots plus an ink pad (`icon-paw.svg`). The journey trail (Wk 0 → 2 → 6 → 12) uses the same four colours, in order.

Colour reference: supplied by the owner (four-colour palette). Only the colours are used, not the reference's letterforms or identity.
