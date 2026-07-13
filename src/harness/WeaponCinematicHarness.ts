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

type DemoPhase = 'idle' | 'attack' | 'pounce' | 'crown-approach' | 'crown-close' | 'crown-return' | 'portal-approach' | 'portal-close' | 'portal-return';

/**
 * Deterministic visual QA room for the weapon and reward cinematics. It is
 * deliberately independent of Game/Input state so a reviewer can verify the
 * high-risk presentation rules without steering a moving camera:
 *
 * - exactly one mallet is visible and only the explicit attack button launches
 *   it; the pounce button jumps without touching the weapon;
 * - the Aurora Crown receives a short close-up rotation before the lens returns
 *   to Nova; and
 * - the launch portal stays fixed while its energy circle, aura and particles
 *   illuminate during its own close-up.
 *
 * Open with `?harness=weapon-cinematics`.
 */
export class WeaponCinematicHarness {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private renderer!: THREE.WebGLRenderer;
  private status!: HTMLElement;
  private phaseText!: HTMLElement;
  private phase: DemoPhase = 'idle';
  private phaseAge = 0;
  private elapsed = 0;
  private lastTimestamp = performance.now();
  private hero?: LoadedModel;
  private heroRoot?: THREE.Group;
  private heroAction?: THREE.AnimationAction;
  private readonly mixers: THREE.AnimationMixer[] = [];
  private mallet!: THREE.Group;
  private target!: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private crown!: THREE.Group;
  private portal!: THREE.Group;
  private portalGate!: THREE.Group;
  private portalEnergy!: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private portalRing!: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
  private portalGlow!: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private readonly portalParticles: THREE.Mesh[] = [];
  private readonly malletRest = new THREE.Vector3(-1.18, 1.3, 0.44);
  private readonly crownWorld = new THREE.Vector3(0.78, 2.14, 0.12);
  private readonly portalWorld = new THREE.Vector3(3.15, 1.28, -0.2);
  private targetPulse = 0;
  private pounceOffset = 0;
  private portalReady = false;
  private disposed = false;

  constructor(private readonly root: HTMLDivElement) {}

  start(): void {
    this.root.innerHTML = `
      <section class="harness-shell weapon-cinematic-harness-shell" aria-label="Weapon and cinematic visual QA harness">
        <canvas class="harness-canvas" aria-label="Weapon and cinematic QA canvas"></canvas>
        <div class="harness-panel weapon-harness-panel">
          <p class="harness-kicker">STARBOUND SPRINT · COMBAT + CINEMATIC QA</p>
          <h1>Mallet, crown, portal</h1>
          <p class="harness-copy">Run each deterministic beat from the buttons below. The mallet has one visible copy and launches only from ATTACK. POUNCE tests the enemy jump path without activating the weapon. CROWN and PORTAL pause on a readable close-up before returning the camera to Nova.</p>
          <div class="weapon-harness-actions" role="group" aria-label="QA scenarios">
            <button class="weapon-harness-button" data-action="attack" type="button">MALLET ATTACK</button>
            <button class="weapon-harness-button" data-action="pounce" type="button">POUNCE (SAFE)</button>
            <button class="weapon-harness-button" data-action="crown" type="button">CROWN CINEMATIC</button>
            <button class="weapon-harness-button" data-action="portal" type="button">PORTAL CINEMATIC</button>
          </div>
          <p class="weapon-harness-phase" aria-live="polite"><span class="weapon-phase-dot"></span><span data-phase>READY · IDLE</span></p>
          <p class="harness-status" aria-live="polite">Loading the Hazmat hero and Aurora Crown…</p>
        </div>
        <div class="weapon-harness-note weapon-harness-note-hero">NOVA · ONE MALLET</div>
        <div class="weapon-harness-note weapon-harness-note-target">TARGET · POUNCE / ATTACK</div>
        <div class="weapon-harness-note weapon-harness-note-crown">AURORA CROWN</div>
        <div class="weapon-harness-note weapon-harness-note-portal">PORTAL · STATIC GATE / CHARGED CIRCLE</div>
      </section>`;

    const canvas = this.element<HTMLCanvasElement>('.harness-canvas');
    this.status = this.element('.harness-status');
    this.phaseText = this.element('[data-phase]');
    // Stable DOM assertions let screenshot QA pair a visual capture with a
    // deterministic transform check: the gate itself is never animated.
    this.root.dataset.weaponHarness = 'ready';
    this.root.dataset.portalGateTransform = 'static';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.configureScene();
    this.bindControls();
    this.resize();
    window.addEventListener('resize', this.resize);
    void this.loadAssets();
    this.renderer.setAnimationLoop(this.tick);
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('resize', this.resize);
    this.renderer?.setAnimationLoop(null);
    this.renderer?.dispose();
  }

  private configureScene(): void {
    this.scene.background = new THREE.Color(0x020514);
    this.scene.fog = new THREE.FogExp2(0x09122e, 0.022);

    const hemisphere = new THREE.HemisphereLight(0xaddfff, 0x140b2b, 2.6);
    const key = new THREE.DirectionalLight(0xfff2d2, 4.4);
    key.position.set(-4, 11, 9);
    const rim = new THREE.PointLight(0x5bd8ff, 20, 42, 2);
    rim.position.set(4, 5.5, 4);
    this.scene.add(hemisphere, key, rim);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 12),
      new THREE.MeshStandardMaterial({ color: 0x071936, roughness: 0.74, metalness: 0.18 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(18, 18, 0x2e78a8, 0x153050);
    grid.position.y = 0.015;
    this.scene.add(grid);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(4.25, 4.55, 0.16, 48),
      new THREE.MeshStandardMaterial({ color: 0x0d224c, emissive: 0x123c5f, emissiveIntensity: 0.35, roughness: 0.38, metalness: 0.62 }),
    );
    platform.position.y = 0.08;
    this.scene.add(platform);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(4.05, 0.045, 8, 64), new THREE.MeshBasicMaterial({ color: 0x4ddaff, transparent: true, opacity: 0.7 }));
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.18;
    this.scene.add(trim);

    this.createHeroPlaceholder();
    this.createTarget();
    this.createCrown();
    this.createPortal();
    this.camera.position.set(0.8, 3.4, 10.3);
    this.camera.lookAt(0.55, 1.35, 0);
  }

  private createHeroPlaceholder(): void {
    const hero = new THREE.Group();
    hero.position.set(-2.15, 0.19, 0.2);
    hero.rotation.y = Math.PI;
    const suit = new THREE.MeshStandardMaterial({ color: 0xeef7ff, roughness: 0.3, metalness: 0.52 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x287dff, emissive: 0x143bc0, emissiveIntensity: 0.7, roughness: 0.24, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.48, 5, 9), suit);
    body.position.y = 0.68;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 10), suit);
    head.position.y = 1.34;
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8), new THREE.MeshBasicMaterial({ color: 0x77efff }));
    visor.scale.set(1, 0.54, 0.3);
    visor.position.set(0, 1.34, 0.2);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.13), accent);
    pack.position.set(0, 0.72, -0.28);
    hero.add(body, head, visor, pack);
    this.heroRoot = hero;
    this.scene.add(hero);

    this.mallet = this.createMallet();
    this.mallet.position.copy(this.malletRest);
    this.scene.add(this.mallet);
  }

  private createMallet(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'single-aurora-mallet';
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.92, 12), new THREE.MeshStandardMaterial({ color: 0x6c3e28, roughness: 0.58, metalness: 0.15 }));
    handle.position.y = -0.28;
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xf5d07b, emissive: 0x8f4c26, emissiveIntensity: 0.22, roughness: 0.28, metalness: 0.64 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.32, 0.34), headMaterial);
    head.position.y = 0.2;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.38, 0.39), headMaterial);
    cap.position.x = 0.29;
    cap.position.y = 0.2;
    group.add(handle, head, cap);
    group.scale.setScalar(0.74);
    group.rotation.z = -0.24;
    return group;
  }

  private createTarget(): void {
    const material = new THREE.MeshStandardMaterial({ color: 0xc55aff, emissive: 0x681ca2, emissiveIntensity: 0.8, roughness: 0.32, metalness: 0.2 });
    this.target = new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 12), material);
    this.target.name = 'single-target';
    this.target.position.set(-0.25, 0.78, 0.18);
    this.scene.add(this.target);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.035, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffa5f4, transparent: true, opacity: 0.7 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-0.25, 0.2, 0.18);
    this.scene.add(ring);
  }

  private createCrown(): void {
    this.crown = new THREE.Group();
    this.crown.name = 'aurora-crown-cinematic';
    this.crown.position.copy(this.crownWorld);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.085, 8, 32), new THREE.MeshStandardMaterial({ color: 0xffd98d, emissive: 0xff48d2, emissiveIntensity: 1.7, metalness: 0.7, roughness: 0.18 }));
    ring.rotation.x = Math.PI / 2;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 1), new THREE.MeshBasicMaterial({ color: 0xc8ffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }));
    gem.position.y = 0.22;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.2, 1.38, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x8defff, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 0.79;
    const aura = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.035, 8, 40), new THREE.MeshBasicMaterial({ color: 0x66e8ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending }));
    aura.rotation.x = Math.PI / 2;
    aura.position.y = 0.03;
    this.crown.add(ring, gem, beam, aura);
    this.scene.add(this.crown);
  }

  private createPortal(): void {
    this.portal = new THREE.Group();
    this.portal.name = 'static-launch-portal';
    this.portal.position.copy(this.portalWorld);
    this.portalGate = new THREE.Group();
    this.portalGate.name = 'portal-gate-static';
    const gateMaterial = new THREE.MeshStandardMaterial({ color: 0x31517f, emissive: 0x102a56, emissiveIntensity: 0.4, roughness: 0.34, metalness: 0.7 });
    const postLeft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.45, 0.32), gateMaterial);
    postLeft.position.x = -0.82;
    postLeft.position.y = 1.23;
    const postRight = postLeft.clone();
    postRight.position.x = 0.82;
    const header = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.24, 0.32), gateMaterial);
    header.position.y = 2.42;
    this.portalGate.add(postLeft, postRight, header);
    this.portal.add(this.portalGate);

    this.portalRing = new THREE.Mesh(new THREE.TorusGeometry(0.71, 0.075, 8, 36), new THREE.MeshStandardMaterial({ color: 0x697ca4, emissive: 0x182454, emissiveIntensity: 0.2, roughness: 0.22, metalness: 0.6 }));
    this.portalRing.rotation.x = Math.PI / 2;
    this.portalRing.position.y = 0.22;
    this.portalEnergy = new THREE.Mesh(new THREE.CircleGeometry(0.65, 36), new THREE.MeshBasicMaterial({ color: 0x62eaff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.portalEnergy.rotation.x = -Math.PI / 2;
    this.portalEnergy.position.y = 0.21;
    this.portalGlow = new THREE.Mesh(new THREE.TorusGeometry(1.03, 0.035, 8, 44), new THREE.MeshBasicMaterial({ color: 0x8af5ff, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending }));
    this.portalGlow.rotation.x = Math.PI / 2;
    this.portalGlow.position.y = 0.22;
    this.portal.add(this.portalRing, this.portalEnergy, this.portalGlow);

    for (let i = 0; i < 14; i += 1) {
      const particle = new THREE.Mesh(new THREE.SphereGeometry(0.035 + (i % 3) * 0.012, 8, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x5be7ff : 0xffd67d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
      particle.userData.angle = i / 14 * Math.PI * 2;
      particle.userData.radius = 0.84 + (i % 4) * 0.08;
      particle.userData.height = 0.24 + (i % 3) * 0.09;
      this.portalParticles.push(particle);
      this.portal.add(particle);
    }
    this.scene.add(this.portal);
  }

  private bindControls(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => this.begin(button.dataset.action ?? ''));
    });
  }

  private begin(action: string): void {
    if (action === 'attack') {
      this.phase = 'attack';
      this.setHeroAction(['Punch', 'pounce']);
      this.phaseAge = 0;
      this.targetPulse = 0;
      this.mallet.position.copy(this.malletRest);
      this.mallet.rotation.set(0, 0, -0.24);
      this.status.textContent = 'ATTACK ONLY · one mallet flies once; pounce never calls this path.';
      return;
    }
    if (action === 'pounce') {
      this.phase = 'pounce';
      this.setHeroAction(['Jump', 'pounce']);
      this.phaseAge = 0;
      this.pounceOffset = 0;
      this.mallet.position.copy(this.malletRest);
      this.mallet.rotation.set(0, 0, -0.24);
      this.status.textContent = 'POUNCE SAFE · Nova jumps; the mallet remains attached and does not launch.';
      return;
    }
    if (action === 'crown') {
      this.phase = 'crown-approach';
      this.phaseAge = 0;
      this.portalReady = false;
      this.status.textContent = 'CROWN AVAILABLE · camera is moving to the collectible.';
      return;
    }
    if (action === 'portal') {
      this.phase = 'portal-approach';
      this.phaseAge = 0;
      this.portalReady = false;
      this.status.textContent = 'PORTAL CHARGE · gate remains fixed while the circle prepares to illuminate.';
    }
  }

  private async loadAssets(): Promise<void> {
    const manifest = await this.loadManifest();
    const models = (manifest?.assets ?? []).filter((asset) => asset.kind === 'model/gltf-binary' && asset.url);
    const character = models.find((asset) => asset.id === 'quaternius-hazmat') ?? models.find((asset) => /character|hero|rogue/i.test(`${asset.id} ${asset.url}`));
    const crown = models.find((asset) => /crown|aurora|relic/i.test(`${asset.id} ${asset.url}`));
    const loadedCharacter = await this.loadModel(character?.url);
    if (loadedCharacter && this.heroRoot) {
      const normalized = this.normalizedModel(loadedCharacter.root, 2.5);
      normalized.position.copy(this.heroRoot.position);
      normalized.rotation.y = Math.PI;
      this.scene.remove(this.heroRoot);
      this.heroRoot = normalized;
      this.scene.add(normalized);
      this.hero = loadedCharacter;
      this.setHeroAction(['Idle']);
    }
    const loadedCrown = await this.loadModel(crown?.url);
    if (loadedCrown) {
      const normalized = this.normalizedModel(loadedCrown.root, 1.24);
      // Keep the procedural aura/beam around the authored crown so the
      // collectible remains readable during the close-up instead of becoming
      // a dark silhouette when a static GLB has no emissive materials.
      normalized.position.set(0, 0.05, 0);
      normalized.name = 'quaternius-aurora-crown-cinematic';
      this.crown.add(normalized);
    }
    const characterText = this.hero?.source ?? 'procedural fallback';
    const crownText = loadedCrown?.source ?? 'procedural fallback';
    this.status.textContent = `Ready · mallet only · character: ${characterText} · crown: ${crownText}`;
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

  private async loadModel(url?: string): Promise<LoadedModel | undefined> {
    if (!url) return undefined;
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((resolve, reject) => {
        new GLTFLoader().load(assetPath(url), resolve, undefined, reject);
      });
      gltf.scene.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = false;
          node.receiveShadow = false;
        }
        // The selected Hazmat GLB contains several authored firearm/tool
        // variants. Keep the visual review focused on the single procedural
        // mallet by hiding every authored weapon branch.
        if (/^(Revolver|Sniper|Pistol|SMG|GrenadeLauncher|ShortCannon|Shotgun|RocketLauncher|AK|Shovel|Knife)/.test(node.name)) node.visible = false;
      });
      const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
      const mixer = gltf.animations.length > 0 ? new THREE.AnimationMixer(gltf.scene) : undefined;
      if (mixer) this.mixers.push(mixer);
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

  private setHeroAction(names: string[]): void {
    if (!this.hero?.mixer || !this.heroRoot) return;
    const normalizedNames = names.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const clip = [...this.hero.clips.values()].find((candidate) => {
      const clipName = candidate.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normalizedNames.some((name) => clipName === name || clipName.endsWith(name));
    });
    if (!clip) return;
    this.heroAction?.fadeOut(0.12);
    const action = this.hero.mixer.clipAction(clip);
    const isIdle = normalizedNames.includes('idle');
    action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).setLoop(isIdle ? THREE.LoopRepeat : THREE.LoopOnce, isIdle ? Infinity : 1).fadeIn(0.12).play();
    action.clampWhenFinished = !isIdle;
    this.heroAction = action;
  }

  private readonly tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const delta = Math.min(Math.max((now - this.lastTimestamp) / 1000, 0), 0.05);
    this.lastTimestamp = now;
    this.elapsed += delta;
    this.phaseAge += delta;
    this.updateDemo(delta);
    this.root.dataset.weaponPhase = this.phase;
    this.root.dataset.weaponPhaseAge = this.phaseAge.toFixed(2);
    this.mixers.forEach((mixer) => mixer.update(delta));
    this.renderer.render(this.scene, this.camera);
  };

  private updateDemo(delta: number): void {
    const hero = this.heroRoot;
    if (!hero) return;
    const idleCamera = new THREE.Vector3(0.8, 3.4, 10.3);
    const idleTarget = new THREE.Vector3(0.35, 1.35, 0);
    // Leave enough headroom for the fixed QA panel while keeping the crown a
    // genuine close-up rather than letting the mesh disappear behind text.
    const crownCamera = new THREE.Vector3(0.85, 3.25, 5.15);
    const crownTarget = this.crown.position.clone().add(new THREE.Vector3(0, 0.46, 0));
    const portalCamera = new THREE.Vector3(3.05, 2.7, 4.05);
    const portalTarget = this.portal.position.clone().add(new THREE.Vector3(0, 0.48, 0));

    if (this.phase === 'attack') {
      // Keep the review beat long enough for a remote screenshot round-trip
      // to catch the mallet in flight instead of only the returned idle pose.
      const progress = THREE.MathUtils.clamp(this.phaseAge / 8, 0, 1);
      const arc = Math.sin(Math.min(1, progress) * Math.PI);
      this.mallet.position.set(this.malletRest.x + progress * 1.98, this.malletRest.y + arc * 0.54, this.malletRest.z + progress * 0.3);
      this.mallet.rotation.z = -0.24 + progress * 6.2;
      this.targetPulse = Math.max(0, 1 - Math.abs(progress - 0.55) * 6.5);
      if (this.targetPulse > 0) {
        this.target.scale.setScalar(1 + this.targetPulse * 0.18);
        this.target.material.emissiveIntensity = 0.8 + this.targetPulse * 3.2;
      } else {
        this.target.scale.setScalar(1);
        this.target.material.emissiveIntensity = 0.8;
      }
      this.phaseText.textContent = progress < 0.55 ? 'ATTACK · MALLET IN HAND' : 'ATTACK · MALLET FLIGHT (ONE COPY)';
      if (progress >= 1) {
        this.phase = 'idle';
        this.phaseAge = 0;
        this.mallet.position.copy(this.malletRest);
        this.mallet.rotation.set(0, 0, -0.24);
        this.status.textContent = 'Ready · mallet returned to its single slot; try POUNCE to verify it stays quiet.';
      }
      return;
    } else if (this.phase === 'pounce') {
      const progress = THREE.MathUtils.clamp(this.phaseAge / 4, 0, 1);
      this.pounceOffset = Math.sin(progress * Math.PI) * 0.84;
      hero.position.y = 0.19 + this.pounceOffset;
      this.mallet.position.copy(this.malletRest).add(new THREE.Vector3(0, this.pounceOffset, 0));
      this.mallet.rotation.set(0, 0, -0.24);
      this.phaseText.textContent = 'POUNCE · JUMP ONLY / MALLET STILL';
      if (progress >= 1) {
        hero.position.y = 0.19;
        this.phase = 'idle';
        this.phaseAge = 0;
        this.status.textContent = 'Pounce complete · no weapon animation was activated.';
      }
      return;
    } else if (this.phase === 'crown-approach' || this.phase === 'crown-close' || this.phase === 'crown-return') {
      const total = 3.7;
      const progress = THREE.MathUtils.clamp(this.phaseAge / total, 0, 1);
      if (this.phase === 'crown-approach' && progress >= 0.23) this.phase = 'crown-close';
      if (this.phase === 'crown-close' && progress >= 0.68) this.phase = 'crown-return';
      if (this.phase === 'crown-return' && progress >= 1) {
        this.phase = 'idle';
        this.phaseAge = 0;
        this.status.textContent = 'Crown cinematic complete · camera returned to Nova.';
      }
      const approach = THREE.MathUtils.smoothstep(Math.min(progress / 0.23, 1), 0, 1);
      const returnProgress = THREE.MathUtils.smoothstep(Math.max((progress - 0.68) / 0.32, 0), 0, 1);
      this.camera.position.lerpVectors(idleCamera, crownCamera, approach * (1 - returnProgress));
      if (returnProgress > 0) this.camera.position.lerp(idleCamera, returnProgress);
      this.camera.lookAt(crownTarget.clone().lerp(idleTarget, returnProgress));
      if (progress >= 0.23 && progress < 0.68) {
        this.crown.rotation.y += delta * 1.55;
        this.phaseText.textContent = 'CROWN · CLOSE-UP / ROTATING';
        this.status.textContent = 'Aurora Crown available · close-up hold keeps the collectible readable.';
      } else if (progress < 0.23) {
        this.phaseText.textContent = 'CROWN · CAMERA APPROACH';
      } else {
        this.phaseText.textContent = 'CROWN · RETURN TO NOVA';
      }
      return;
    } else if (this.phase === 'portal-approach' || this.phase === 'portal-close' || this.phase === 'portal-return') {
      const total = 3.6;
      const progress = THREE.MathUtils.clamp(this.phaseAge / total, 0, 1);
      if (this.phase === 'portal-approach' && progress >= 0.25) {
        this.phase = 'portal-close';
        this.portalReady = true;
      }
      if (this.phase === 'portal-close' && progress >= 0.72) this.phase = 'portal-return';
      if (this.phase === 'portal-return' && progress >= 1) {
        this.phase = 'idle';
        this.phaseAge = 0;
        this.portalReady = false;
        this.status.textContent = 'Portal cinematic complete · static gate remains ready in the world.';
      }
      const approach = THREE.MathUtils.smoothstep(Math.min(progress / 0.25, 1), 0, 1);
      const returnProgress = THREE.MathUtils.smoothstep(Math.max((progress - 0.72) / 0.28, 0), 0, 1);
      this.camera.position.lerpVectors(idleCamera, portalCamera, approach * (1 - returnProgress));
      if (returnProgress > 0) this.camera.position.lerp(idleCamera, returnProgress);
      this.camera.lookAt(portalTarget.clone().lerp(idleTarget, returnProgress));
      const charged = this.portalReady && progress < 0.72;
      this.portalEnergy.material.opacity = charged ? 0.42 + Math.sin(this.elapsed * 5) * 0.08 : 0.06;
      this.portalRing.material.emissiveIntensity = charged ? 1.7 + Math.sin(this.elapsed * 6) * 0.35 : 0.2;
      this.portalGlow.material.opacity = charged ? 0.64 + Math.sin(this.elapsed * 4) * 0.14 : 0.04;
      this.portalParticles.forEach((particle, index) => {
        const material = particle.material as THREE.MeshBasicMaterial;
        const angle = Number(particle.userData.angle) + this.elapsed * (0.8 + (index % 3) * 0.16);
        const radius = Number(particle.userData.radius);
        particle.position.set(this.portal.position.x + Math.cos(angle) * radius, this.portal.position.y + Number(particle.userData.height) + Math.sin(this.elapsed * 3 + index) * 0.08, this.portal.position.z + Math.sin(angle) * radius);
        material.opacity = charged ? 0.68 + Math.sin(this.elapsed * 7 + index) * 0.22 : 0;
      });
      this.phaseText.textContent = progress < 0.25 ? 'PORTAL · CAMERA APPROACH' : progress < 0.72 ? 'PORTAL · CIRCLE ILLUMINATED / FX' : 'PORTAL · RETURN TO NOVA';
      this.status.textContent = charged ? 'Launch circle charged · aura and particles are visible while the gate stays static.' : 'Portal static · only the named energy circle may change appearance.';
      return;
    }

    hero.position.y = 0.19;
    this.mallet.position.copy(this.malletRest);
    this.mallet.rotation.set(0, 0, -0.24);
    this.target.scale.setScalar(1);
    this.target.material.emissiveIntensity = 0.8;
    this.camera.position.lerp(idleCamera, 0.16);
    this.camera.lookAt(idleTarget);
    this.phaseText.textContent = 'READY · IDLE';
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.root.clientWidth);
    const height = Math.max(1, this.root.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private element<T extends Element = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing weapon cinematic harness element: ${selector}`);
    return element;
  }
}
