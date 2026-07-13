import * as THREE from 'three';

const assetPath = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

/**
 * A standalone visual review room for imported world props. It intentionally
 * does not boot Game or MobileInput, so an asset can be judged without game
 * camera interpolation, HUD, or collision code hiding a bad silhouette.
 */
export class AssetHarness {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private renderer!: THREE.WebGLRenderer;
  private status!: HTMLElement;

  constructor(private readonly root: HTMLDivElement) {}

  start(): void {
    this.root.innerHTML = `
      <section class="harness-shell asset-harness-shell" aria-label="Portal asset visual QA harness">
        <canvas class="harness-canvas" aria-label="Portal asset visual QA canvas"></canvas>
        <div class="harness-panel asset-harness-panel">
          <p class="harness-kicker">STARBOUND SPRINT · PORTAL ASSET HARNESS</p>
          <h1>Launch gate visual QA</h1>
          <p class="harness-copy">The imported CC0 gate is staged beside the old runtime fallback. This room isolates silhouette, scale, materials, and framing before the portal is viewed in a moving sphere scene.</p>
          <div class="harness-legend" aria-label="Portal asset legend">
            <span><i class="harness-swatch asset-swatch-external"></i>KENNEY GLB · CC0</span>
            <span><i class="harness-swatch asset-swatch-fallback"></i>PROCEDURAL FALLBACK</span>
          </div>
          <p class="harness-status" aria-live="polite">Loading the external launch gate…</p>
        </div>
        <div class="harness-rig-label asset-harness-label-left">EXTERNAL GATE</div>
        <div class="harness-rig-label asset-harness-label-right">FALLBACK</div>
      </section>`;

    const canvas = this.element<HTMLCanvasElement>('.harness-canvas');
    this.status = this.element('.harness-status');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.configureScene();
    this.resize();
    window.addEventListener('resize', this.resize);
    void this.loadExternalPortal();
    this.renderer.setAnimationLoop(this.tick);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }

  private configureScene(): void {
    this.scene.background = new THREE.Color(0x020514);
    this.scene.fog = new THREE.FogExp2(0x09122e, 0.018);

    const hemisphere = new THREE.HemisphereLight(0xaddfff, 0x140b2b, 2.6);
    const key = new THREE.DirectionalLight(0xfff2d2, 4.2);
    key.position.set(8, 13, 10);
    const rim = new THREE.PointLight(0x5bd8ff, 20, 38, 2);
    rim.position.set(-9, 7, -5);
    this.scene.add(hemisphere, key, rim);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 16),
      new THREE.MeshStandardMaterial({ color: 0x071936, roughness: 0.74, metalness: 0.18 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(20, 20, 0x2e78a8, 0x153050);
    grid.position.y = 0.015;
    this.scene.add(grid);

    this.scene.add(this.createPedestal(-3.25, 0x6ee7ff), this.createPedestal(3.25, 0xffcb66));
    this.scene.add(this.createFallbackPortal());
    this.camera.position.set(0, 4.7, 14.4);
    this.camera.lookAt(0, 1.85, 0);
  }

  private createPedestal(x: number, color: number): THREE.Group {
    const group = new THREE.Group();
    group.position.x = x;
    const material = new THREE.MeshStandardMaterial({
      color: 0x111f42,
      emissive: color,
      emissiveIntensity: 0.28,
      roughness: 0.38,
      metalness: 0.72,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.45, 0.22, 48), material);
    base.position.y = 0.11;
    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(2.02, 0.045, 8, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82 }),
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.24;
    group.add(base, trim);
    return group;
  }

  private createFallbackPortal(): THREE.Group {
    const group = new THREE.Group();
    group.position.x = 3.25;
    const color = 0xffcb66;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.095, 8, 40),
      new THREE.MeshStandardMaterial({ color, emissive: 0xff8b32, emissiveIntensity: 1.2, metalness: 0.58, roughness: 0.2 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.57;
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(1.24, 40),
      new THREE.MeshBasicMaterial({ color: 0xffb746, transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 1.53;
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 2.8, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    beacon.position.y = 2.5;
    group.add(ring, inner, beacon);
    return group;
  }

  private async loadExternalPortal(): Promise<void> {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        new GLTFLoader().load(assetPath('assets/portals/kenney-gate-complex.glb'), resolve, undefined, reject);
      });
      const model = gltf.scene;
      model.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = false;
          node.receiveShadow = false;
        }
      });
      const bounds = new THREE.Box3().setFromObject(model);
      const sourceSize = bounds.getSize(new THREE.Vector3());
      const scale = 3.7 / Math.max(0.001, Math.max(sourceSize.x, sourceSize.y, sourceSize.z));
      model.scale.setScalar(scale);
      model.rotation.y = Math.PI;
      const scaledBounds = new THREE.Box3().setFromObject(model);
      const center = scaledBounds.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -scaledBounds.min.y + 0.28, -center.z);
      const holder = new THREE.Group();
      holder.position.x = -3.25;
      holder.add(model);
      this.scene.add(holder);
      const triangleCount = this.countTriangles(model);
      this.status.textContent = `Loaded Kenney gate_complex.glb · ${triangleCount.toLocaleString()} triangles · CC0 source · 29.9 KB`;
    } catch {
      this.status.textContent = 'External gate failed to load; fallback remains visible for QA.';
    }
  }

  private countTriangles(root: THREE.Object3D): number {
    let triangles = 0;
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const geometry = node.geometry;
      const index = geometry.getIndex();
      triangles += index ? index.count / 3 : (geometry.getAttribute('position')?.count ?? 0) / 3;
    });
    return Math.round(triangles);
  }

  private readonly tick = (): void => {
    // The gate is a static landmark in the game and in the asset review room;
    // only the runtime energy effects are allowed to animate around it.
    this.camera.lookAt(0, 1.85, 0);
    this.renderer.render(this.scene, this.camera);
  };

  private readonly resize = (): void => {
    const width = Math.max(1, this.root.clientWidth);
    const height = Math.max(1, this.root.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private element<T extends Element = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing asset harness element: ${selector}`);
    return element;
  }
}
