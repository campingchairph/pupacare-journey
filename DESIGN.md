# PupaCare Journey: design build spec

Mobile-only, no-build PWA. Warm, friendly and local. It should feel like a fellow fur-parent wrote it, not a clinic.

## References (MotionSites)
- **Stillmind**: calm wellness app. Soft italic serif headline, one idea per first screen, quiet pill buttons.
- **Bloom AI**: natural brand. Serif italic accent words inside a rounded sans system; pill chips.
- **Craft "paper on photography"**: warm cream page, with the owner's own dog photo as the hero media.

## Signature
**Pupa's trail.** The dog's own photo sits in an inset, rounded frame, with a dotted paw-print trail under it showing
Wk 0 → 2 → 6 → 12. The current week glows, and every 14-day check-in drops a paw on the trail.

## Tokens
| Token | Value | Use |
|---|---|---|
| `--bg` | `#FBF5EC` | page (first CSS rule on html, body) |
| `--card` | `#FFFFFF` | cards |
| `--cream-2` | `#F3E8D8` | chips, inset frames, inputs |
| `--ink` | `#2B2118` | text |
| `--ink-2` | `#5C4A3B` | secondary text |
| `--ink-3` | `#8E7B69` | labels, hints |
| `--line` | `rgba(60,40,20,.10)` | borders |
| `--accent` | `#D9773A` (kamote orange) | primary CTA fill, active tab, trail glow |
| `--accent-soft` | `rgba(217,119,58,.14)` | selected chips, bars |
| `--good` | `#6E9461` | improving status only |
| `--alert` | `#B9382A` | red flags + safety only |

Fonts: **Fraunces** (headings, 500, italic accent words in `--ink-2`) + **Nunito** (body, 400/600/700/800).
Sizes: H1 `clamp(34px,10vw,44px)`/1.02/−0.03em; H2 22px/1.15; body 15.5px/1.55; labels 11.5px uppercase +0.14em.
Radii: cards 24px, inset photo frame 28px, buttons and chips are pills. Shadow: `0 4px 16px rgba(60,40,20,.08)`.

## Layout
- Fixed full viewport (`100dvh`), max-width 480px centred, 20px gutters, safe-area padding.
- Bottom pill tab bar (5): Today · Check · Plan · Log · Report. Active tab is filled with `--accent` and white ink.
- Modals are bottom sheets, radius 28px top, easing `cubic-bezier(.32,.72,0,1)` 420ms.

## Motion
- Welcome headline: per-word rise (opacity 0→1, y 24px→0, 80ms stagger, 800ms, `cubic-bezier(.22,1,.36,1)`).
- Cards fade up on tab switch (y 12px, 400ms, 60ms stagger). Hover/press: `:active` scale .97.
- `prefers-reduced-motion`: no motion; everything visible at rest.

## Copy
- H1: "Gentle steps for / itchy *paws*."
- Sub: "A journal and plan-builder by fellow fur-parents in the Philippines. We're not vets. This helps you bring better notes and better questions to yours."
- CTA: "Start the journey" (welcome), then "Start Pupa's check" (Today).

## Safety, as UI rules
- Red flags are always the first screen of a check and a check-in. Any yes shows a full-screen "Go to a vet now" with no plan.
- No dose numbers anywhere. Every formula card says "Dose: follow the product label and confirm with your vet."
- Long Dan, ImmunoBomb: a "Vet supervision" badge in `--alert`.
- The taper screen always shows "Never stop prednisone suddenly."
- The disclaimer must be accepted on first launch and stays in Settings.
