# Weapon and cinematic QA

The deterministic harness is available at `?harness=weapon-cinematics`. It is
separate from the game loop so visual regressions can be checked without
steering Nova into a target or relying on a moving follow camera.

## Test matrix

| Control | Expected acceptance | Regression to watch |
| --- | --- | --- |
| `MALLET ATTACK` | One mallet leaves Nova's hand once, arcs toward the target, then returns to its single slot. The hero has no extra firearm/knife copies. | Weapon clones, a weapon fired by movement, or a stuck detached mesh. |
| `POUNCE (SAFE)` | Nova jumps while the mallet stays in its rest pose. Status reads `POUNCE SAFE` and no attack flight appears. | Pounce path accidentally calling the weapon animation or attack resolver. |
| `CROWN CINEMATIC` | Camera approaches the available Aurora Crown, holds a readable rotating close-up, then returns to Nova. | Crown hidden behind the hero, no rotation, or camera left on the relic. |
| `PORTAL CINEMATIC` | Portal gate transform never changes. During the close-up, the named circle, ring, aura, and particles brighten; camera returns to Nova afterward. | Whole gate rotating, no activation effects, or charged circle hidden by the camera. |

## Capture checklist

Use a 1280×720 browser viewport and capture these stable names:

- `weapon-mallet-attack.png` at `ATTACK · MALLET FLIGHT (ONE COPY)`
- `weapon-pounce-safe.png` at `POUNCE · JUMP ONLY / MALLET STILL`
- `weapon-crown-closeup.png` at `CROWN · CLOSE-UP / ROTATING`
- `weapon-portal-closeup.png` at `PORTAL · CIRCLE ILLUMINATED / FX`
- `weapon-cinematic-return.png` after each cinematic reports `camera returned to Nova`

The browser console should contain no errors or warnings. The loaded status
should name `quaternius-hazmat` and `quaternius-aurora-crown`; a procedural
fallback is acceptable only when the corresponding GLB request is unavailable.

## Implementation notes

The harness hides every authored Hazmat firearm/tool branch and renders one
low-cost procedural mallet, keeping the weapon regression obvious. Pounce and
attack are separate buttons and separate phase handlers. Portal visuals use a
static gate group plus independent circle/ring/particle materials, so a
transform snapshot can distinguish intended illumination from accidental
rotation. Crown and portal timelines expose explicit approach, close-up, and
return phases for screenshot review.

## Build evidence

- `npm run build` passed (TypeScript strict/no-unused checks and Vite bundle).
- New route bundle: `WeaponCinematicHarness-*.js`.
- Run `node C:/Users/joshs/.codex/skills/game-screenshot-qa/scripts/screenshot_manifest.mjs docs/qa` after captures to record image dimensions and hashes.
