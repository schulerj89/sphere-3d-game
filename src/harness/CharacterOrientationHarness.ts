import * as THREE from 'three';

const assetPath = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

type HarnessRig = {
  readonly group: THREE.Group;
  readonly mixer: THREE.AnimationMixer;
};

export class CharacterOrientationHarness {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private renderer!: THREE.WebGLRenderer;
  private animationFrame = 0;
  private lastTimestamp = performance.now();
  private leftRig: HarnessRig | undefined;
  private rightRig: HarnessRig | undefined;
  private status!: HTMLElement;

  constructor(private readonly root: HTMLDivElement) {}

  start(): void {
    this.root.innerHTML = `
      <section class="harness-shell" aria-label="Character orientation harness">
        <canvas class="harness-canvas" aria-label="Character orientation harness canvas"></canvas>
        <div class="harness-panel">
          <p class="harness-kicker">STARBOUND SPRINT · ORIENTATION HARNESS</p>
          <h1>Which way is forward?</h1>
          <p class="harness-copy">Both runners move along <strong>+Z</strong> and play the real run animation. The left rig has no yaw correction; the right rig has a 180° correction.</p>
          <div class="harness-legend" aria-label="Orientation legend">
            <span><i class="harness-swatch harness-swatch-move"></i>MOVEMENT +Z</span>
            <span><i class="harness-swatch harness-swatch-model"></i>MODEL FORWARD</span>
          </div>
          <p class="harness-status" aria-live="polite">Loading the authored character model&hellip;</p>
        </div>
        <div class="harness-rig-label harness-rig-label-left">YAW 0°</div>
        <div class="harness-rig-label harness-rig-label-right">YAW 180°</div>
      </section>`;

    const canvas = this.element<HTMLCanvasElement>('.harness-canvas');
    this.status = this.element('.harness-status');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.configureScene();
    this.resize();
    window.addEventListener('resize', this.resize);
    void this.loadCharacter();
    this.renderer.setAnimationLoop(this.tick);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    cancelAnimationFrame(this.animationFrame);
  }

  private configureScene(): void {
    this.scene.background = new THREE.Color(0x020514);
    this.scene.fog = new THREE.FogExp2(0x09122e, 0.018);

    const hemisphere = new THREE.HemisphereLight(0xaddfff, 0x140b2b, 2.7);
    const key = new THREE.DirectionalLight(0xfff2d2, 4.2);
    key.position.set(7, 12, 9);
    const rim = new THREE.PointLight(0x5bd8ff, 18, 35, 2);
    rim.position.set(-8, 7, -5);
    this.scene.add(hemisphere, key, rim);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 18),
      new THREE.MeshStandardMaterial({ color: 0x071936, roughness: 0.74, metalness: 0.18 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(18, 18, 0x2e78a8, 0x153050);
    grid.position.y = 0.015;
    this.scene.add(grid);

    this.addDirectionArrow(-2.4);
    this.addDirectionArrow(2.4);
    this.camera.position.set(0, 3.7, 11.5);
    this.camera.lookAt(0, 1.15, 0);
  }

  private addDirectionArrow(x: number): void {
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(x, 0.08, -1.55),
      3.2,
      0x6ee7ff,
      0.42,
      0.2,
    );
    this.scene.add(arrow);
  }

  private async loadCharacter(): Promise<void> {
    try {
      const [{ GLTFLoader }, { clone: cloneSkinned }] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/utils/SkeletonUtils.js'),
      ]);
      const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((resolve, reject) => {
        new GLTFLoader().load(assetPath('assets/characters/kaykit-rogue.glb'), resolve, undefined, reject);
      });

      const leftModel = this.prepareModel(gltf.scene);
      const rightModel = this.prepareModel(cloneSkinned(gltf.scene) as THREE.Group);
      rightModel.rotation.y = Math.PI;

      const leftGroup = new THREE.Group();
      leftGroup.position.x = -2.4;
      leftGroup.add(leftModel);
      const rightGroup = new THREE.Group();
      rightGroup.position.x = 2.4;
      rightGroup.add(rightModel);
      this.scene.add(leftGroup, rightGroup);

      const runClip = THREE.AnimationClip.findByName(gltf.animations, 'Running_A');
      this.leftRig = { group: leftGroup, mixer: new THREE.AnimationMixer(leftModel) };
      this.rightRig = { group: rightGroup, mixer: new THREE.AnimationMixer(rightModel) };
      if (runClip) {
        this.leftRig.mixer.clipAction(runClip).play();
        this.rightRig.mixer.clipAction(runClip).play();
      }
      this.status.textContent = 'Forward is +Z. Compare each rig’s face with the cyan movement arrow.';
    } catch {
      this.status.textContent = 'Unable to load kaykit-rogue.glb.';
    }
  }

  private prepareModel(model: THREE.Group): THREE.Group {
    model.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = false;
        node.receiveShadow = false;
      }
    });
    const bounds = new THREE.Box3().setFromObject(model);
    const height = bounds.getSize(new THREE.Vector3()).y;
    model.scale.setScalar(2.52 / Math.max(0.001, height));
    const scaledBounds = new THREE.Box3().setFromObject(model);
    model.position.y = -scaledBounds.min.y;
    const modelForwardArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 1.18, 0),
      2.05,
      0xffcb66,
      0.28,
      0.14,
    );
    model.add(modelForwardArrow);
    return model;
  }

  private readonly tick = (): void => {
    const now = performance.now();
    const delta = Math.min(Math.max((now - this.lastTimestamp) / 1000, 0), 0.05);
    this.lastTimestamp = now;
    this.leftRig?.mixer.update(delta);
    this.rightRig?.mixer.update(delta);
    this.camera.lookAt(0, 1.15, 0);
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
    if (!element) throw new Error(`Missing orientation harness element: ${selector}`);
    return element;
  }
}
