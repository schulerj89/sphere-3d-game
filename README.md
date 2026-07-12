# Starbound Sprint

A mobile-first, spherical 3D platformer built with Three.js.

## Local development

```bash
npm install
npm run dev
```

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
