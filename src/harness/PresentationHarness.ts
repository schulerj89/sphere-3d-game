import * as THREE from 'three';

const assetPath = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

interface ManifestAsset {
  readonly id?: string;
  readonly kind?: string;
  readonly url?: string;
}

interface AssetManifest {
  readonly assets?: ManifestAsset[];
}

interface LoadedModel {
  readonly root: THREE.Group;
  readonly mixer?: THREE.AnimationMixer;
  readonly clips: Map<string, THREE.AnimationClip>;
  readonly source: string;
}

interface PresentationStation {
  readonly group: THREE.Group;
  readonly label: HTMLElement;
}

/**
 * A deterministic visual regression room for the presentation beats that are
 * difficult to judge from the moving game camera. It deliberately owns no
 * Game/Input state: the portal can be checked for a fixed transform, the
 * victory rig for ground contact/upright orientation, the defeat rig for a
 * one-shot frozen pose, and the relic for a clean silhouette.
 *
 * Open with `?harness=presentation`. Asset candidates are discovered from the
 * runtime asset manifest so a future external character/crown can be reviewed
 * without changing the harness source; procedural stand-ins remain visible if
 * a candidate is absent or fails to load.
 */
export class PresentationHarness {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private renderer!: THREE.WebGLRenderer;
  private status!: HTMLElement;
  private readonly stations: PresentationStation[] = [];
  private readonly animatedMixers: THREE.AnimationMixer[] = [];
  private readonly portalReadyMaterials: THREE.MeshBasicMaterial[] = [];
  private lastTimestamp = performance.now();
  private elapsed = 0;

  constructor(private readonly root: HTMLDivElement) {}

  start(): void {
    this.root.innerHTML = `
      <section class="harness-shell presentation-harness-shell" aria-label="Presentation visual QA harness">
        <canvas class="harness-canvas" aria-label="Presentation visual QA canvas"></canvas>
        <div class="harness-panel presentation-harness-panel">
          <p class="harness-kicker">STARBOUND SPRINT · PRESENTATION QA</p>
          <h1>Portal, celebration, defeat, relic</h1>
          <p class="harness-copy">Four fixed camera poses make the high-risk presentation rules obvious: the launch portal never spins, its circle only glows when charged, Nova stays grounded and upright for the celebration, the death pose freezes after one fall, and the Aurora Crown reads as a collectible.</p>
          <p class="harness-status" aria-live="polite">Loading presentation assets…</p>
        </div>
        <div class="presentation-label presentation-label-portal">PORTAL · STATIC / CHARGED</div>
        <div class="presentation-label presentation-label-celebrate">CELEBRATE · FEET GROUNDED</div>
        <div class="presentation-label presentation-label-defeat">DEFEAT · ONE SHOT / FROZEN</div>
        <div class="presentation-label presentation-label-relic">AURORA CROWN · EXTERNAL OR FALLBACK</div>
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
    void this.loadAssets();
    this.renderer.setAnimationLoop(this.tick);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }

  private configureScene(): void {
    this.scene.background = new THREE.Color(0x020514);
    this.scene.fog = new THREE.FogExp2(0x09122e, 0.019);

    const hemisphere = new THREE.HemisphereLight(0xaddfff, 0x140b2b, 2.7);
    const key = new THREE.DirectionalLight(0xfff2d2, 4.2);
    key.position.set(8, 14, 11);
    const rim = new THREE.PointLight(0x5bd8ff, 22, 44, 2);
    rim.position.set(-8, 8, 5);
    this.scene.add(hemisphere, key, rim);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 13),
      new THREE.MeshStandardMaterial({ color: 0x071936, roughness: 0.74, metalness: 0.18 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(24, 24, 0x2e78a8, 0x153050);
    grid.position.y = 0.015;
    this.scene.add(grid);

    const xPositions = [-4.15, -1.38, 1.38, 4.15];
    const colors = [0x6ee7ff, 0x9fffc8, 0xff9db6, 0xffd77e];
    xPositions.forEach((x, index) => {
      const group = new THREE.Group();
      group.position.x = x;
      group.add(this.createPedestal(colors[index]));
      this.scene.add(group);
      this.stations.push({ group, label: this.element(`.presentation-label-${['portal', 'celebrate', 'defeat', 'relic'][index]}`) });
    });

    this.camera.position.set(0, 6.25, 22.4);
    this.camera.lookAt(0, 2.35, 0);
  }

  private createPedestal(color: number): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0x111f42,
      emissive: color,
      emissiveIntensity: 0.24,
      roughness: 0.38,
      metalness: 0.72,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.72, 0.18, 40), material);
    base.position.y = 0.09;
    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(1.42, 0.035, 8, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82 }),
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.2;
    group.add(base, trim);
    return group;
  }

  private createPortalPair(): THREE.Group {
    const group = new THREE.Group();
    group.position.y = 0.2;
    const notReady = this.createPortalVariant(0x5e6d9a, false);
    notReady.position.x = -0.78;
    const ready = this.createPortalVariant(0x63ebff, true);
    ready.position.x = 0.78;
    group.add(notReady, ready);
    return group;
  }

  private createPortalVariant(color: number, charged: boolean): THREE.Group {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.63, 0.06, 8, 32),
      new THREE.MeshStandardMaterial({ color, emissive: charged ? color : 0x161f4f, emissiveIntensity: charged ? 1.6 : 0.18, metalness: 0.62, roughness: 0.2 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.73;
    const innerMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: charged ? 0.54 : 0.08, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.56, 32), innerMaterial);
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.7;
    if (charged) this.portalReadyMaterials.push(innerMaterial);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.45, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: charged ? 0.46 : 0.15, blending: THREE.AdditiveBlending, depthWrite: false }));
    beacon.position.y = 1.25;
    group.add(ring, inner, beacon);
    return group;
  }

  private createSpherePatch(radius = 1.22, color = 0x45b993): THREE.Group {
    const patch = new THREE.Group();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 14),
      new THREE.MeshStandardMaterial({ color, emissive: 0x123c4b, emissiveIntensity: 0.25, roughness: 0.58, metalness: 0.08 }),
    );
    sphere.position.y = radius;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 24),
      new THREE.MeshBasicMaterial({ color: 0x031323, transparent: true, opacity: 0.46, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = radius * 2 + 0.006;
    shadow.scale.set(1.3, 0.62, 1);
    patch.add(sphere, shadow);
    return patch;
  }

  private createFallbackHero(): THREE.Group {
    const group = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: 0xeef7ff, roughness: 0.3, metalness: 0.52 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x287dff, emissive: 0x143bc0, emissiveIntensity: 0.7, roughness: 0.24, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 5, 9), suit);
    body.position.y = 0.65;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), suit);
    head.position.y = 1.27;
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 8), new THREE.MeshBasicMaterial({ color: 0x77efff }));
    visor.scale.set(1, 0.54, 0.3);
    visor.position.set(0, 1.27, 0.18);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.13), accent);
    pack.position.set(0, 0.7, -0.26);
    group.add(body, head, visor, pack);
    return group;
  }

  private createFallbackCrown(): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0xffe4a4, emissive: 0xff83e4, emissiveIntensity: 1.55, metalness: 0.68, roughness: 0.18 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.11, 8, 28), material);
    ring.rotation.x = Math.PI / 2;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 1), new THREE.MeshBasicMaterial({ color: 0xbffbff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }));
    gem.position.y = 0.22;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.2, 1.45, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x8defff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending }));
    beam.position.y = 0.78;
    group.add(ring, gem, beam);
    return group;
  }

  private async loadAssets(): Promise<void> {
    const manifest = await this.loadManifest();
    const models = (manifest?.assets ?? []).filter((asset) => asset.kind === 'model/gltf-binary' && asset.url);
    const characterAsset = models.find((asset) => asset.id === 'quaternius-hazmat')
      ?? models.find((asset) => /character|rogue|hero/i.test(`${asset.id} ${asset.url}`));
    const crownAsset = models.find((asset) => /crown|relic|aurora/i.test(`${asset.id} ${asset.url}`));
    const portalAsset = models.find((asset) => /portal|gate/i.test(`${asset.id} ${asset.url}`));

    const portal = this.createPortalPair();
    this.stations[0].group.add(portal);
    if (portalAsset?.url) {
      const gate = await this.loadModel(portalAsset.url);
      if (gate) {
        const model = this.normalizedModel(gate.root, 1.72);
        model.position.set(0, 0.2, -0.56);
        // Static by design: the harness must make accidental launch-pad spins
        // obvious instead of disguising them with a camera orbit.
        model.rotation.y = Math.PI;
        this.stations[0].group.add(model);
      }
    }

    const celebrationPatch = this.createSpherePatch(1.22, 0x45b993);
    celebrationPatch.position.y = 0.18;
    this.stations[1].group.add(celebrationPatch);
    const celebration = await this.loadOrFallbackCharacter(characterAsset?.url);
    this.placeCharacterOnPatch(celebration, celebrationPatch, 'Cheer');
    this.stations[1].group.add(celebration.root);

    const defeatPatch = this.createSpherePatch(1.22, 0x533d76);
    defeatPatch.position.y = 0.18;
    this.stations[2].group.add(defeatPatch);
    const defeat = await this.loadOrFallbackCharacter(characterAsset?.url);
    this.placeCharacterOnPatch(defeat, defeatPatch, 'Death_A');
    const deathAction = this.findAction(defeat, ['Death_A', 'Death_B', 'Death', 'Hit_A', 'HitReact']);
    if (deathAction) {
      deathAction.reset().play();
      deathAction.time = deathAction.getClip().duration * 0.96;
      deathAction.paused = true;
    }
    this.stations[2].group.add(defeat.root);

    const crown = crownAsset?.url ? await this.loadModel(crownAsset.url) : undefined;
    const crownRoot = crown?.root ?? this.createFallbackCrown();
    const normalizedCrown = this.normalizedModel(crownRoot, 1.18);
    normalizedCrown.position.y = 0.4;
    this.stations[3].group.add(normalizedCrown);

    const characterText = characterAsset?.url ? characterAsset.id ?? characterAsset.url : 'procedural fallback';
    const crownText = crownAsset?.url ? crownAsset.id ?? crownAsset.url : 'procedural fallback';
    this.status.textContent = `Portal static · charged circle isolated · celebration grounded · death frozen · character: ${characterText} · crown: ${crownText}`;
  }

  private async loadManifest(): Promise<AssetManifest | undefined> {
    try {
      const response = await fetch(assetPath('assets/asset-manifest.json'), { cache: 'no-store' });
      if (!response.ok) return undefined;
      return await response.json() as AssetManifest;
    } catch {
      return undefined;
    }
  }

  private async loadOrFallbackCharacter(url?: string): Promise<LoadedModel> {
    if (url) {
      const loaded = await this.loadModel(url);
      if (loaded) return loaded;
    }
    return { root: this.createFallbackHero(), clips: new Map(), source: 'procedural fallback' };
  }

  private async loadModel(url: string): Promise<LoadedModel | undefined> {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((resolve, reject) => {
        new GLTFLoader().load(assetPath(url), resolve, undefined, reject);
      });
      const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
      const mixer = gltf.animations.length > 0 ? new THREE.AnimationMixer(gltf.scene) : undefined;
      if (mixer) this.animatedMixers.push(mixer);
      gltf.scene.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = false;
          node.receiveShadow = false;
        }
        // The Quaternius hazmat file ships a complete firearm shelf in one
        // scene. Hide those variants in the review room just as the game
        // loader does, so the character silhouette is judged without a weapon
        // pile-up.
        if (/^(Revolver|Sniper|Pistol|SMG|GrenadeLauncher|ShortCannon|Shotgun|RocketLauncher|AK|Shovel|Knife)/.test(node.name)) {
          node.visible = false;
        }
      });
      return { root: gltf.scene, mixer, clips, source: url };
    } catch {
      return undefined;
    }
  }

  private normalizedModel(root: THREE.Group, targetHeight: number): THREE.Group {
    const bounds = new THREE.Box3().setFromObject(root);
    const height = Math.max(0.001, bounds.getSize(new THREE.Vector3()).y);
    root.scale.setScalar(targetHeight / height);
    const scaledBounds = new THREE.Box3().setFromObject(root);
    root.position.y -= scaledBounds.min.y;
    return root;
  }

  private placeCharacterOnPatch(model: LoadedModel, patch: THREE.Group, clipName: string): void {
    const normalized = this.normalizedModel(model.root, 1.72);
    const patchRadius = 1.22;
    normalized.position.set(patch.position.x, patch.position.y + patchRadius * 2 + 0.015, patch.position.z);
    normalized.rotation.set(0, Math.PI, 0);
    const action = this.findAction(model, clipName === 'Death_A'
      ? ['Death_A', 'Death_B', 'Death', 'Hit_A', 'HitReact']
      : ['Cheer', 'Wave', 'Dance', 'Victory']);
    if (action) {
      action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      if (clipName === 'Death_A') action.setLoop(THREE.LoopOnce, 1);
    }
  }

  private findAction(model: LoadedModel, names: string[]): THREE.AnimationAction | undefined {
    if (!model.mixer) return undefined;
    const normalizedNames = names.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const clip = [...model.clips.values()].find((candidate) => {
      const clipName = candidate.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normalizedNames.some((name) => clipName === name || clipName.endsWith(name));
    });
    return clip ? model.mixer.clipAction(clip) : undefined;
  }

  private readonly tick = (): void => {
    const now = performance.now();
    const delta = Math.min(Math.max((now - this.lastTimestamp) / 1000, 0), 0.05);
    this.lastTimestamp = now;
    this.elapsed += delta;
    // Only the charge indicator breathes. No portal/object transform changes,
    // making a screenshot after several seconds a valid static regression.
    this.portalReadyMaterials.forEach((material) => {
      material.opacity = 0.43 + Math.sin(this.elapsed * 3.2) * 0.1;
    });
    this.animatedMixers.forEach((mixer) => mixer.update(delta));
    this.camera.lookAt(0, 2.3, 0);
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
    if (!element) throw new Error(`Missing presentation harness element: ${selector}`);
    return element;
  }
}
