# Mallet weapon QA

The hero now presents one procedural `Nova mallet` and hides every authored
Quaternius gun/knife branch. The mallet is parented to `Index1R` when the
Hazmat GLB is available, and falls back to the procedural hero root when the
GLB cannot be loaded.

Acceptance checks:

- Start the run and confirm only one weapon silhouette is visible: a cyan
  hammer head with a short metallic handle.
- Press `ATTACK` (or `F`) beside a Voidling. The character attack clip and the
  mallet wind-up/forward hammer arc play once, then the mallet returns to the
  hand.
- Jump onto a Voidling. The enemy pounce bounce still resolves, but no mallet
  swing starts because weapon animation is now triggered only by explicit
  attack input.
- Repeat with the fallback hero (temporarily block the Hazmat GLB). The same
  single mallet remains visible and the attack arc still runs.

Build verification: `npm run build` (TypeScript check + Vite production build)
passes on the `feature/mallet-weapon` worktree.
