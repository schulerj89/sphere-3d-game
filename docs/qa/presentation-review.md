# Presentation QA

The standalone harness is available at `?harness=presentation` and is intended
for deterministic screenshot review, outside the moving game camera. The
capture in `presentation-harness.png` contains four fixed stations:

| Station | Acceptance check |
| --- | --- |
| Portal | Gate transform stays fixed over time; the uncharged circle is dim and the charged circle is the only illuminated state. |
| Celebration | Nova's feet meet the top of the sphere patch, the sphere normal is local up, and the Hazmat `Wave` clip is readable without an inverted rig. |
| Defeat | The Hazmat `Death` clip is sampled once near the end and paused; the rig remains in that pose while the camera can orbit. |
| Relic | The Quaternius Aurora Crown GLB is visible with its low-cost cyan aura retained as a readability layer. |

## Findings and fixes

Before the gameplay fix, `Planet.update()` advanced `launchPad.rotation.y` on
every frame, so the portal could not satisfy the static-transform requirement.
The gate is now a fixed landmark; only the named energy circle/ring changes
opacity and pulse after the ring threshold is met. The old defeat loop
repeatedly called `setCharacterAnimation('hurt')` during the first half of the
cinematic and never explicitly paused the action after the fall. The imported
death action now uses `LoopOnce`, clamps, and pauses at the end. The reward beat
snaps Nova to the sphere surface, aligns local up to the sphere normal, and
starts from an outward camera that keeps the defeated arena out of the frame.

## Capture metadata

- Route: `http://127.0.0.1:5189/?harness=presentation`
- View: In-app Browser visual QA viewport (1280x720)
- Browser console: no errors or warnings
- Loaded character: `quaternius-hazmat` (17 animation clips, manifest-discovered)
- Crown: `quaternius-aurora-crown` (840 triangles, manifest-discovered)
- Portal: `kenney-gate-complex` (manifest-discovered)
- File: `docs/qa/presentation-harness.png`
