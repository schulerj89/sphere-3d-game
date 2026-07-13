# Presentation QA

The standalone harness is available at `?harness=presentation` and is intended
for deterministic screenshot review, outside the moving game camera. The
capture in `presentation-harness.png` contains four fixed stations:

| Station | Acceptance check |
| --- | --- |
| Portal | Gate transform stays fixed over time; the uncharged circle is dim and the charged circle is the only illuminated state. |
| Celebration | Nova's feet meet the top of the sphere patch, local up is world-up, and the `Cheer` clip is readable without an inverted rig. |
| Defeat | `Death_A`/`Death_B` is sampled once near the end and paused; the rig remains in that pose while the camera can orbit. |
| Relic | The external crown model is used when it appears in `asset-manifest.json`; otherwise the intentionally simple procedural crown makes the silhouette/scale reviewable. |

## Baseline findings

Before the gameplay fix, `Planet.update()` advanced `launchPad.rotation.y` on
every frame, so the portal could not satisfy the static-transform requirement.
The old defeat loop repeatedly called `setCharacterAnimation('hurt')` during
the first half of the cinematic and never explicitly paused the action after
the fall, which is consistent with a repeated fall/hurt pose. The harness
isolates both presentation concerns so a future capture can confirm that only
the charged material and camera change over time.

## Capture metadata

- Route: `http://127.0.0.1:5189/?harness=presentation`
- View: Chrome visual QA viewport (1251×1270)
- Browser console: no errors or warnings
- Loaded character: `kaykit-rogue` (manifest-discovered)
- Crown: procedural fallback (no external crown was present in the baseline manifest)
- Portal: `kenney-gate-complex` (manifest-discovered)
- File: `docs/qa/presentation-harness.png`
