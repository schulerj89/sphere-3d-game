# Starbound Sprint

A mobile-first, spherical 3D platformer built with Three.js. Guide Nova across
three tiny worlds, collect star tokens, pounce Voidlings, and launch through
cinematic orbital transfers.

## What is playable

- Three procedural planets: Luma Garden, Cinder Circuit, and Aurora Crown.
- 72 collectible star tokens, 18 pounceable enemies, three-heart health, and
  a complete three-world demo loop.
- Dynamic spherical movement, jump physics, comet-cloud foot trails, and a
  camera that follows the planet curvature.
- Touch-first controls: left joystick, right-side camera drag, pinch zoom, and
  a large JUMP button; WASD/arrows and Space also work on desktop.
- A CC0 Quaternius Hazmat model with idle/run/jump/pounce/hurt animation clips,
  a single procedural mallet, CC0 SFX/fallback music, and an embedded Eleven
  Music v2 gameplay loop.

For render and asset counters, append `?debug=1` to the local or hosted URL.

The portal can be reviewed outside the game camera at `?harness=assets` (for
example, `http://localhost:5173/?harness=assets`). The harness places the
Kenney gate beside the procedural fallback and reports the imported mesh
triangle count before it is enabled on the spheres. The presentation QA room
is available at `?harness=presentation`; it keeps portal static/charged,
celebration ground contact, one-shot defeat freeze, and crown silhouette in a
single deterministic camera view. It discovers character/crown GLBs from
`public/assets/asset-manifest.json` and reports when a procedural fallback is
being reviewed.

The combat and reward beats have a separate deterministic review room at
`?harness=weapon-cinematics`. Use its controls to capture the mallet-only
attack, pounce-safe weapon state, Aurora Crown close-up/return, and portal
activation FX without steering the live game camera. See
[docs/qa/weapon-cinematic-review.md](docs/qa/weapon-cinematic-review.md) for
the screenshot matrix.

## Local development

```bash
npm install
npm run dev
```

See [docs/ASSET_SOURCES.md](docs/ASSET_SOURCES.md) and
[docs/ATTRIBUTIONS.md](docs/ATTRIBUTIONS.md) for asset sources and licenses.

## Test a production build

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

The GitHub Actions workflow deploys the built `dist` folder whenever changes
reach `main`. To deploy on demand, open the **Actions** tab, select **Deploy to
GitHub Pages**, choose `main`, and click **Run workflow**.

Before the first deployment, set **Settings → Pages → Build and deployment →
Source** to **GitHub Actions**. Once the workflow succeeds, the game will be
available at `https://schulerj89.github.io/sphere-3d-game/`.

Vite uses relative asset paths so the build works from this project Pages URL.
