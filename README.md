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
- A CC0 KayKit Rogue model with idle/run/jump/pounce/hurt animation clips,
  CC0 SFX/fallback music, and an embedded Eleven Music v2 gameplay loop.

For render and asset counters, append `?debug=1` to the local or hosted URL.

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
