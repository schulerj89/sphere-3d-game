import * as THREE from 'three';
import { AudioDirector } from './AudioDirector';
import { StardustTrail } from './StardustTrail';
import {
  createHeroVisual,
  GalaxyBackdrop,
  HeroVisual,
  Planet,
  PLANET_DEFINITIONS,
  surfaceOrientation,
} from './World';
import { MobileInput } from '../input/MobileInput';

type GamePhase = 'title' | 'playing' | 'cinematic' | 'portalActivation' | 'defeat' | 'bossVictory' | 'complete';

interface LaunchCinematic {
  readonly source: Planet;
  readonly destination: Planet;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  elapsed: number;
}

interface DefeatCinematic {
  readonly origin: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly heading: THREE.Vector3;
  readonly fallAxis: THREE.Vector3;
  elapsed: number;
  retryReady: boolean;
  animationFrozen: boolean;
}

interface BossVictoryCinematic {
  readonly planet: Planet;
  readonly origin: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly heading: THREE.Vector3;
  readonly source: 'rings' | 'boss';
  readonly relic?: Planet['relics'][number];
  readonly finale: boolean;
  readonly focusDuration: number;
  readonly animationDuration: number;
  animationStarted: boolean;
  elapsed: number;
}

interface PortalActivationCinematic {
  readonly planet: Planet;
  readonly playerPosition: THREE.Vector3;
  readonly playerNormal: THREE.Vector3;
  readonly playerHeading: THREE.Vector3;
  readonly portalNormal: THREE.Vector3;
  elapsed: number;
}

interface StarboundDebugSnapshot {
  readonly phase: GamePhase;
  readonly currentPlanet: string;
  readonly playerPosition: readonly [number, number, number];
  readonly health: number;
  readonly coins: number;
  readonly planetsCompleted: number;
  readonly loadedAssetIds: readonly string[];
  readonly assetErrors: readonly string[];
  readonly launch: {
    readonly ready: boolean;
    readonly portalVisible: boolean;
    readonly energyOpacity: number;
  };
  readonly boss?: {
    readonly health: number;
    readonly maxHealth: number;
    readonly defeated: boolean;
    readonly attackPhase: string;
    readonly attackCooldown: number;
    readonly relicsReady: number;
    readonly relicsCollected: number;
    readonly relicsTotal: number;
  };
  readonly renderer: {
    readonly calls: number;
    readonly triangles: number;
    readonly geometries: number;
    readonly textures: number;
  };
  readonly audio: ReturnType<AudioDirector['debugSnapshot']>;
}

declare global {
  interface Window {
    __starboundDebug?: () => StarboundDebugSnapshot;
  }
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_CAMERA_DISTANCE = 20;
const MINIMUM_LOADING_SCREEN_DURATION = 650;
const assetPath = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

export class Game {
  private readonly audio = new AudioDirector();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 430);
  private readonly hero: HeroVisual = createHeroVisual();
  private readonly playerNormal = new THREE.Vector3();
  private readonly playerHeading = new THREE.Vector3(0, 0, 1);
  // This stays independent from playerHeading so a D-pad turn is visible
  // instead of the follow camera rotating with Nova and hiding the turn.
  private readonly cameraHeading = new THREE.Vector3(0, 0, 1);
  private readonly playerPosition = new THREE.Vector3();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly lookAtTarget = new THREE.Vector3();
  private readonly galaxy = new GalaxyBackdrop();
  private readonly trail = new StardustTrail();
  private readonly defeatFx = new THREE.Group();
  private readonly defeatRingMaterial = new THREE.MeshBasicMaterial({
    color: 0x8fe9ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly defeatCoreMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb6c9,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly defeatRing = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.065, 8, 40), this.defeatRingMaterial);
  private readonly defeatCore = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), this.defeatCoreMaterial);

  private renderer!: THREE.WebGLRenderer;
  private input: MobileInput | undefined;
  private planets: Planet[] = [];
  private activePlanet!: Planet;
  private phase: GamePhase = 'title';
  private cinematic: LaunchCinematic | undefined;
  private portalActivationCinematic: PortalActivationCinematic | undefined;
  private defeatCinematic: DefeatCinematic | undefined;
  private bossVictoryCinematic: BossVictoryCinematic | undefined;
  private readonly portalActivationShown = new WeakSet<Planet>();
  private portalActivationFx: THREE.Group | undefined;
  private elapsed = 0;
  private lastFrameTimestamp = performance.now();
  private playerHeight = 0;
  private verticalVelocity = 0;
  private cameraPitch = 0.34;
  private cameraDistance = DEFAULT_CAMERA_DISTANCE;
  private health = 3;
  private coins = 0;
  private defeatedEnemies = 0;
  private invulnerability = 0;
  private attackCooldown = 0;
  private attackWindow = 0;
  private retrying = false;
  private trailCooldown = 0;
  private fps = 60;
  private muted = false;
  private modelMixer: THREE.AnimationMixer | undefined;
  private activeAnimation: THREE.AnimationAction | undefined;
  private readonly modelActions = new Map<string, THREE.AnimationAction>();
  private animationLockedUntil = 0;
  private characterReady = false;
  private loadingStartedAt = 0;
  private readonly loadedAssetIds = ['procedural-planets', 'procedural-boss', 'procedural-hero'];
  private readonly assetErrors: string[] = [];

  private loadingScreen!: HTMLElement;
  private titleScreen!: HTMLElement;
  private hud!: HTMLElement;
  private cinematicOverlay!: HTMLElement;
  private cinematicTitle!: HTMLElement;
  private cinematicSubtitle!: HTMLElement;
  private defeatRetryButton!: HTMLButtonElement;
  private completeScreen!: HTMLElement;
  private planetName!: HTMLElement;
  private missionText!: HTMLElement;
  private bossCard!: HTMLElement;
  private bossMeterFill!: HTMLElement;
  private bossMeterText!: HTMLElement;
  private coinText!: HTMLElement;
  private healthText!: HTMLElement;
  private relicText!: HTMLElement;
  private statusText!: HTMLElement;
  private debugText!: HTMLElement;
  private muteButton!: HTMLButtonElement;

  constructor(private readonly root: HTMLDivElement) {}

  start(): void {
    this.loadingStartedAt = performance.now();
    this.root.innerHTML = this.template();
    const canvas = this.element<HTMLCanvasElement>('.game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setAnimationLoop(this.tick);

    this.loadingScreen = this.element('.loading-screen');
    this.titleScreen = this.element('.title-screen');
    this.hud = this.element('.hud');
    this.cinematicOverlay = this.element('.cinematic-overlay');
    this.cinematicTitle = this.element('.cinematic-overlay p');
    this.cinematicSubtitle = this.element('.cinematic-overlay span');
    this.defeatRetryButton = this.element<HTMLButtonElement>('.defeat-retry-button');
    this.completeScreen = this.element('.complete-screen');
    this.planetName = this.element('.hud-planet');
    this.missionText = this.element('.mission-copy');
    this.bossCard = this.element('.boss-card');
    this.bossMeterFill = this.element('.boss-meter-fill');
    this.bossMeterText = this.element('.boss-meter-text');
    this.coinText = this.element('.coin-count');
    this.healthText = this.element('.health-count');
    this.relicText = this.element('.relic-count');
    this.statusText = this.element('.status-copy');
    this.debugText = this.element('.debug-panel');
    this.muteButton = this.element<HTMLButtonElement>('.mute-button');

    this.configureScene();
    this.bindUi();
    this.resize();
    this.updateUi();
    void Promise.all([
      this.loadCharacterModel(),
      this.loadLaunchPortalModel(),
      this.loadRelicModel(),
    ]).then(this.finishLoading);
    window.addEventListener('resize', this.resize);
    window.__starboundDebug = () => this.debugSnapshot();
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    this.input?.destroy();
    this.audio.dispose();
  }

  private configureScene(): void {
    this.scene.background = new THREE.Color(0x020514);
    this.scene.fog = new THREE.FogExp2(0x09122e, 0.0065);
    this.defeatRing.rotation.x = Math.PI / 2;
    this.defeatFx.add(this.defeatRing, this.defeatCore);
    this.defeatFx.visible = false;
    this.scene.add(this.galaxy.group, this.trail.mesh, this.hero.group, this.defeatFx);

    const hemisphere = new THREE.HemisphereLight(0x99d8ff, 0x120d2d, 2.4);
    const keyLight = new THREE.DirectionalLight(0xfff4d5, 3.2);
    keyLight.position.set(19, 34, 26);
    const rimLight = new THREE.PointLight(0x6fb7ff, 16, 85, 2);
    rimLight.position.set(-25, 18, 16);
    this.scene.add(hemisphere, keyLight, rimLight);

    this.planets = PLANET_DEFINITIONS.map((definition) => new Planet(definition));
    for (const planet of this.planets) this.scene.add(planet.group);
    this.activePlanet = this.planets[0];
    this.placePlayerAt(this.activePlanet, this.activePlanet.definition.startNormal);

    this.camera.position.set(24, 19, 26);
    this.cameraPosition.copy(this.camera.position);
    this.camera.lookAt(this.activePlanet.definition.center);
  }

  private bindUi(): void {
    this.element<HTMLButtonElement>('.start-button').addEventListener('click', this.begin);
    this.element<HTMLButtonElement>('.restart-button').addEventListener('click', () => window.location.reload());
    this.defeatRetryButton.addEventListener('click', this.retryRun);
    this.defeatRetryButton.addEventListener('pointerup', this.retryRun);
    this.muteButton.addEventListener('click', () => {
      this.muted = this.audio.toggleMute();
      this.muteButton.textContent = this.muted ? 'SOUND OFF' : 'SOUND ON';
      this.muteButton.setAttribute('aria-pressed', String(this.muted));
    });
  }

  private readonly begin = (): void => {
    if (this.phase !== 'title' || !this.characterReady) return;
    this.phase = 'playing';
    this.titleScreen.classList.add('is-hidden');
    this.hud.classList.remove('is-hidden');
    this.audio.start();
    this.audio.play('confirm');
    this.hero.triggerWeaponAnimation('equip', this.elapsed);
    this.input = new MobileInput({ mount: document.body, joystickRadius: 61 });
    this.setStatus('Find bright star tokens, then stand in the launch halo and press JUMP.');
    this.configureQaScenario();
    this.updateUi();
  };

  private readonly tick = (): void => {
    const now = performance.now();
    const delta = Math.min(Math.max((now - this.lastFrameTimestamp) / 1000, 0), 0.05);
    this.lastFrameTimestamp = now;
    this.elapsed += delta;
    this.fps = THREE.MathUtils.lerp(this.fps, 1 / Math.max(delta, 0.001), 0.08);
    this.galaxy.update(delta);
    this.trail.update(delta);
    this.modelMixer?.update(delta);
    for (const planet of this.planets) {
      // Only the active arena supplies a target to the Warden AI. Other
      // planets keep their deterministic visual animation without trying to
      // attack a player who is in transit or on another world.
      planet.update(delta, this.phase === 'playing' && planet === this.activePlanet ? this.playerNormal : undefined);
    }

    if (this.phase === 'playing') {
      this.updatePlaying(delta);
    } else if (this.phase === 'cinematic') {
      this.updateCinematic(delta);
    } else if (this.phase === 'portalActivation') {
      this.updatePortalActivation(delta);
    } else if (this.phase === 'defeat') {
      this.updateDefeat(delta);
    } else if (this.phase === 'bossVictory') {
      this.updateBossVictory(delta);
    } else if (this.phase === 'title') {
      this.updateTitleCamera(delta);
    } else {
      this.updateCompleteCamera(delta);
    }

    this.renderer.render(this.scene, this.camera);
  };

  private updatePlaying(delta: number): void {
    this.updateCameraInput();
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.attackWindow = Math.max(0, this.attackWindow - delta);
    if (this.input?.consumeAttackPressed()) {
      this.beginAttack();
    }
    const movement = this.input?.movement ?? { x: 0, y: 0 };
    const desired = this.cameraRelativeMovement(movement.x, movement.y);
    const grounded = this.playerHeight <= 0.001;

    if (this.input?.consumeJumpPressed()) {
      if (grounded && this.activePlanet.isNearLaunch(this.playerNormal) && this.activePlanet.isLaunchReady) {
        this.beginLaunch();
        return;
      }
      if (grounded) {
        this.verticalVelocity = 10.8;
        this.audio.play('jump');
        this.triggerAnimation('jumpStart', 0.24);
        this.setStatus('Arc high enough to pounce on a Voidling.');
      } else if (this.activePlanet.isBossPlanet && this.activePlanet.isNearLaunch(this.playerNormal) && !this.activePlanet.isLaunchReady) {
        this.setStatus(this.activePlanet.isRelicReady
          ? `The Aurora Crown relics are still waiting at the Warden arena (${this.activePlanet.relicsCollected}/${this.activePlanet.relics.length}).`
          : 'The final launch halo answers only to both Aurora Crown relics.');
      } else if (this.activePlanet.isNearLaunch(this.playerNormal) && !this.activePlanet.isLaunchReady) {
        this.setStatus(`Launch halo needs ${this.activePlanet.coinTarget - this.activePlanet.collectedCoins} more star tokens.`);
      }
    }

    const speed = desired.lengthSq() > 0.001 ? 8.4 : 0;
    if (speed > 0) {
      const axis = new THREE.Vector3().crossVectors(this.playerNormal, desired).normalize();
      const distance = speed * delta;
      const surfaceRotation = distance / this.activePlanet.definition.radius;
      this.playerNormal.applyAxisAngle(axis, surfaceRotation).normalize();
      this.playerHeading.applyAxisAngle(axis, surfaceRotation).projectOnPlane(this.playerNormal).normalize();
      this.cameraHeading.applyAxisAngle(axis, surfaceRotation).projectOnPlane(this.playerNormal).normalize();
      const targetHeading = desired.clone().projectOnPlane(this.playerNormal).normalize();
      const turnAngle = this.playerHeading.angleTo(targetHeading);
      if (turnAngle > 0.0001) {
        const turnAxis = new THREE.Vector3().crossVectors(this.playerHeading, targetHeading);
        // Opposite directions have no cross product; choose a stable turn on
        // the current surface instead of letting the heading collapse to zero.
        if (turnAxis.lengthSq() < 0.0001) turnAxis.copy(this.playerNormal);
        else turnAxis.normalize();
        this.playerHeading.applyAxisAngle(turnAxis, Math.min(16 * delta, turnAngle));
      }
      this.playerHeading.projectOnPlane(this.playerNormal).normalize();
    }

    this.verticalVelocity -= 27 * delta;
    this.playerHeight += this.verticalVelocity * delta;
    if (this.playerHeight <= 0) {
      this.playerHeight = 0;
      this.verticalVelocity = 0;
    }

    this.invulnerability = Math.max(0, this.invulnerability - delta);
    this.trailCooldown -= delta;
    this.updatePlayerVisual(speed, this.playerHeight > 0.02);
    if (speed > 0 && this.playerHeight < 0.08 && this.trailCooldown <= 0) {
      this.trail.emit(this.playerPosition, this.playerNormal, this.playerHeading);
      this.trailCooldown = 0.055;
    }
    this.collectAndResolveEncounters();
    this.updateCamera(delta);
    this.updateUi();
  }

  private updateCameraInput(): void {
    if (!this.input) return;
    const look = this.input.consumeLookDelta();
    if (look.x !== 0) {
      this.cameraHeading.applyAxisAngle(this.playerNormal, -look.x * 0.006).projectOnPlane(this.playerNormal).normalize();
    }
    this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch - look.y * 0.004, 0.09, 0.85);
    this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance - this.input.consumeZoomDelta() * 0.023, 8.5, 23);
  }

  private cameraRelativeMovement(x: number, y: number): THREE.Vector3 {
    if (x === 0 && y === 0) return new THREE.Vector3();
    const cameraToward = this.cameraHeading.clone().projectOnPlane(this.playerNormal).normalize();
    const right = new THREE.Vector3().crossVectors(this.playerNormal, cameraToward).normalize();
    // cameraToward points from Nova toward the lead camera. Screen-up/Forward
    // must travel away from that camera; keep horizontal right/left unchanged.
    return cameraToward.multiplyScalar(-y).addScaledVector(right, x).normalize();
  }

  private updatePlayerVisual(speed: number, airborne: boolean): void {
    this.playerPosition.copy(this.activePlanet.worldPosition(this.playerNormal, 0.08 + this.playerHeight));
    this.hero.group.position.copy(this.playerPosition);
    this.hero.group.quaternion.copy(surfaceOrientation(this.playerNormal, this.playerHeading));
    this.hero.setRunCycle(speed, this.elapsed, airborne);
    this.hero.setHurt(this.invulnerability > 0 && Math.floor(this.elapsed * 18) % 2 === 0);
    if (this.elapsed >= this.animationLockedUntil) {
      this.setCharacterAnimation(airborne ? 'jumpAir' : speed > 0.15 ? 'run' : 'idle');
    }
  }

  private collectAndResolveEncounters(): void {
    const launchWasReady = this.activePlanet.isLaunchReady;
    const collected = this.activePlanet.collectNear(this.playerNormal, 1.24);
    if (collected) {
      this.coins += 1;
      this.audio.play('coin');
      if (this.activePlanet.isBossPlanet) {
        const remaining = Math.max(0, this.activePlanet.relicRingTarget - this.activePlanet.collectedCoins);
        this.setStatus(remaining === 0
          ? 'Ring relic awakened! Find it at the Warden arena, then defeat the boss for the second crown.'
          : `${remaining} more rings to awaken the Aurora Crown.`);
      } else {
        const remaining = Math.max(0, this.activePlanet.coinTarget - this.activePlanet.collectedCoins);
        this.setStatus(remaining === 0 ? 'Launch halo charged! Stand inside and press JUMP.' : `${remaining} more star tokens to charge the launch halo.`);
      }
    }

    // The final ring should feel like a payoff rather than a silent HUD
    // change. Freeze the run for a short, deterministic portal reveal before
    // handing control back to Nova. The WeakSet gate keeps a ready portal
    // from replaying if the player circles back over its launch halo.
    if (collected && !launchWasReady && this.activePlanet.isLaunchReady
      && !this.portalActivationShown.has(this.activePlanet)) {
      this.portalActivationShown.add(this.activePlanet);
      this.beginPortalActivation();
      return;
    }

    const relic = this.activePlanet.collectRelicNear(this.playerNormal);
    if (relic) {
      this.audio.play('complete');
      // Every crown is a payoff beat. The first relic gets a short return-to-
      // play celebration; the second relic gets the full ending sequence.
      // Keeping this gate here also prevents a fast pickup from skipping the
      // cinematic when the player is already overlapping the other relic.
      this.beginBossVictory(this.activePlanet.allRelicsCollected, relic.source, relic);
      return;
    }

    // A weapon strike gets first priority over contact damage. This makes the
    // touch attack button deterministic: one press opens a short hit window,
    // and the target is damaged at most once during that window.
    if (this.attackWindow > 0 && this.resolveWeaponAttack()) return;

    const boss = this.activePlanet.bossNear(this.playerNormal);
    if (boss) {
      if (this.playerHeight > 0.72 && this.verticalVelocity < 0) {
        const defeated = this.activePlanet.damageBoss();
        this.verticalVelocity = 10.2;
        this.audio.play('pounce');
        this.triggerAnimation('pounce', 0.52);
        if (defeated) {
          // The arena score resolves as soon as the Warden falls. Do not
          // leave the boss scheduler running while Nova hunts the second
          // crown relic.
          this.audio.setBossTheme(false);
          this.audio.setCinematic(false);
        }
        this.setStatus(defeated
          ? 'The Crown Warden falls! One Aurora Crown relic is ready; collect the ring relic too.'
          : `Crown Warden struck! ${boss.health}/${boss.maxHealth} armor remaining.`);
        return;
      }
      if (boss.attackPhase === 'telegraph') {
        if (boss.attackAge < 0.1) this.setStatus('The Crown Warden is charging a lunge — move!');
        return;
      }
      if (boss.attackPhase === 'lunge') {
        if (boss.attackHit || this.invulnerability > 0 || this.playerHeight > 0.45) return;
        boss.attackHit = true;
        this.health -= 1;
        this.invulnerability = 1.25;
        this.verticalVelocity = 6.8;
        this.audio.play('hit');
        this.triggerAnimation('hurt', 0.4);
        if (this.health <= 0) {
          this.beginDefeat();
        } else {
          this.setStatus('The Warden lunge connected. Keep moving between telegraphs.');
        }
        return;
      }
      if (this.invulnerability > 0 || this.playerHeight > 0.45) return;
      this.health -= 1;
      this.invulnerability = 1.25;
      this.verticalVelocity = 6.8;
      this.audio.play('hit');
      this.triggerAnimation('hurt', 0.4);
      if (this.health <= 0) {
        this.beginDefeat();
      } else {
        this.setStatus('The Crown Warden is charged with starlight. Pounce from above.');
      }
      return;
    }

    const enemy = this.activePlanet.enemyNear(this.playerNormal);
    if (!enemy) return;
    if (this.playerHeight > 0.72 && this.verticalVelocity < 0) {
      enemy.defeated = true;
      this.verticalVelocity = 9.2;
      this.defeatedEnemies += 1;
      this.audio.play('pounce');
      this.triggerAnimation('pounce', 0.46);
      this.setStatus('Voidling bounced! Keep your momentum and hunt more tokens.');
      return;
    }
    if (this.invulnerability > 0 || this.playerHeight > 0.45) return;
    this.health -= 1;
    this.invulnerability = 1.25;
    this.verticalVelocity = 6.8;
    this.audio.play('hit');
    this.triggerAnimation('hurt', 0.4);
    if (this.health <= 0) {
      this.beginDefeat();
    } else {
      this.setStatus('Ouch! Pounce from above or keep a little distance.');
    }
  }

  private beginAttack(): void {
    if (this.phase !== 'playing' || this.attackCooldown > 0) return;
    this.attackCooldown = 0.62;
    this.attackWindow = 0.24;
    this.triggerAnimation('pounce', 0.54);
    this.audio.play('attack');
    this.setStatus('Weapon strike! Close in on a Voidling or the Warden.');
  }

  private resolveWeaponAttack(): boolean {
    const boss = this.activePlanet.bossNear(this.playerNormal, 3.15);
    if (boss) {
      const defeated = this.activePlanet.damageBoss();
      this.attackWindow = 0;
      this.audio.play('hit');
      if (defeated) {
        this.audio.setBossTheme(false);
        this.audio.setCinematic(false);
      }
      this.setStatus(defeated
        ? 'The Crown Warden falls! One Aurora Crown relic is ready; collect the ring relic too.'
        : `Crown Warden struck! ${boss.health}/${boss.maxHealth} armor remaining.`);
      return true;
    }

    const enemy = this.activePlanet.enemyNear(this.playerNormal, 2.35);
    if (!enemy) return false;
    enemy.defeated = true;
    this.attackWindow = 0;
    this.defeatedEnemies += 1;
    this.audio.play('hit');
    this.setStatus('Voidling sliced! Keep your momentum and hunt more tokens.');
    return true;
  }

  private beginLaunch(): void {
    const planetIndex = this.planets.indexOf(this.activePlanet);
    const destination = this.planets[planetIndex + 1];
    if (!destination) {
      this.phase = 'complete';
      this.audio.setBossTheme(false);
      this.audio.play('complete');
      this.triggerAnimation('celebrate', 1.1);
      this.hud.classList.add('is-hidden');
      this.completeScreen.classList.remove('is-hidden');
      return;
    }
    this.phase = 'cinematic';
    this.cinematic = {
      source: this.activePlanet,
      destination,
      start: this.playerPosition.clone(),
      end: destination.worldPosition(destination.definition.startNormal, 0.1),
      elapsed: 0,
    };
    this.cinematicOverlay.classList.add('is-active');
    this.cinematicOverlay.classList.remove('is-defeat');
    this.hud.classList.add('is-hidden');
    this.input?.setVisible(false);
    this.setCinematicCopy('ORBITAL SLINGSHOT', 'Hold tight, runner.');
    this.audio.play('launch');
    this.audio.setCinematic(true);
    this.setStatus(`Slingshotting to ${destination.definition.name}…`);
  }

  /**
   * Freeze on the newly charged launch halo before the player can leave it.
   * This is intentionally separate from beginLaunch(): the transfer shot is
   * only entered after the player presses JUMP, while this beat celebrates the
   * exact moment the final ring powers the portal.
   */
  private beginPortalActivation(): void {
    if (this.phase !== 'playing') return;
    const planet = this.activePlanet;
    const playerNormal = this.playerNormal.clone().normalize();
    const playerHeading = this.playerHeading.clone().projectOnPlane(playerNormal);
    if (playerHeading.lengthSq() < 0.001) playerHeading.copy(WORLD_UP).projectOnPlane(playerNormal);
    playerHeading.normalize();
    const portalNormal = planet.definition.launchNormal.clone().normalize();
    this.ensurePortalActivationFx(planet);
    this.phase = 'portalActivation';
    this.portalActivationCinematic = {
      planet,
      playerPosition: this.playerPosition.clone(),
      playerNormal,
      playerHeading,
      portalNormal,
      elapsed: 0,
    };
    this.hud.classList.add('is-hidden');
    this.cinematicOverlay.classList.add('is-active', 'is-portal-activation');
    this.cinematicOverlay.classList.remove('is-defeat', 'is-boss-victory');
    this.input?.setVisible(false);
    this.setCinematicCopy('PORTAL ONLINE', 'The launch halo is fully charged.');
    this.audio.play('launch');
    this.audio.setCinematic(true);
    this.setStatus('Launch halo activated.');
  }

  private updatePortalActivation(delta: number): void {
    const cinematic = this.portalActivationCinematic;
    if (!cinematic) return;
    cinematic.elapsed += delta;
    const focusDuration = 2.15;
    const duration = 4.2;
    const raw = THREE.MathUtils.clamp(cinematic.elapsed / duration, 0, 1);
    const focusRaw = THREE.MathUtils.clamp(cinematic.elapsed / focusDuration, 0, 1);

    // Nova is frozen at the exact surface point where the last ring was
    // collected. The portal focus never mutates playerNormal, so the return
    // shot can hand control back without a visible snap or D-pad drift.
    this.hero.group.position.copy(cinematic.playerPosition);
    this.hero.group.quaternion.copy(surfaceOrientation(cinematic.playerNormal, cinematic.playerHeading));
    this.hero.setRunCycle(0, this.elapsed, false);
    this.setCharacterAnimation('idle');

    const fx = this.portalActivationFx;
    if (fx) {
      fx.visible = true;
      const pulse = 1 + Math.sin(this.elapsed * 8.5) * 0.11;
      fx.scale.setScalar(THREE.MathUtils.lerp(0.72, 1.15, smoothstep(focusRaw)) * pulse);
      fx.rotation.y += delta * 0.9;
      const progress = THREE.MathUtils.clamp(cinematic.elapsed / focusDuration, 0, 1);
      fx.traverse((node) => {
        if (!(node instanceof THREE.Mesh || node instanceof THREE.PointLight)) return;
        const material = node instanceof THREE.Mesh && Array.isArray(node.material)
          ? node.material[0]
          : node instanceof THREE.Mesh ? node.material : undefined;
        if (material && 'opacity' in material) {
          material.opacity = THREE.MathUtils.clamp(0.25 + progress * 0.7, 0, 0.96);
        }
        if (node instanceof THREE.PointLight) node.intensity = 5 + progress * 18;
      });
    }

    const portalPosition = cinematic.planet.worldPosition(cinematic.portalNormal, 0.32);
    const side = new THREE.Vector3().crossVectors(cinematic.portalNormal, cinematic.playerHeading).normalize();
    if (side.lengthSq() < 0.001) side.set(1, 0, 0);
    const tangent = cinematic.playerHeading.clone().projectOnPlane(cinematic.portalNormal).normalize();
    if (tangent.lengthSq() < 0.001) tangent.copy(side);

    const cameraPosition = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    if (raw < 0.56) {
      const beat = smoothstep(raw / 0.56);
      const orbit = cinematic.elapsed * 1.2;
      cameraPosition.copy(portalPosition)
        .addScaledVector(cinematic.portalNormal, THREE.MathUtils.lerp(7.4, 5.4, beat))
        .addScaledVector(side, Math.sin(orbit) * THREE.MathUtils.lerp(2.1, 3.5, beat))
        .addScaledVector(tangent, Math.cos(orbit) * 1.4);
      cameraTarget.copy(portalPosition).addScaledVector(cinematic.portalNormal, 0.35);
      this.camera.up.copy(cinematic.portalNormal);
      this.setCinematicCopy('PORTAL ONLINE', 'The launch halo answers the starlight.');
    } else {
      const beat = smoothstep((raw - 0.56) / 0.44);
      const sideOffset = new THREE.Vector3().crossVectors(cinematic.playerNormal, cinematic.playerHeading).normalize();
      if (sideOffset.lengthSq() < 0.001) sideOffset.set(1, 0, 0);
      cameraPosition.copy(cinematic.playerPosition)
        .addScaledVector(cinematic.playerNormal, THREE.MathUtils.lerp(8.2, DEFAULT_CAMERA_DISTANCE, beat))
        .addScaledVector(cinematic.playerHeading, THREE.MathUtils.lerp(3.6, 5.4, beat))
        .addScaledVector(sideOffset, Math.sin(cinematic.elapsed * 0.8) * 1.2);
      cameraTarget.copy(cinematic.playerPosition).addScaledVector(cinematic.playerNormal, 1.12);
      this.camera.up.copy(cinematic.playerNormal);
      this.setCinematicCopy('ROUTE READY', 'Nova can jump whenever you are ready.');
    }
    this.camera.position.lerp(cameraPosition, 1 - Math.exp(-10 * delta));
    this.camera.lookAt(cameraTarget);

    if (raw < 1) return;
    if (fx) fx.visible = false;
    this.portalActivationCinematic = undefined;
    this.phase = 'playing';
    this.cinematicOverlay.classList.remove('is-active', 'is-portal-activation');
    this.hud.classList.remove('is-hidden');
    this.input?.setVisible(true);
    this.cameraDistance = DEFAULT_CAMERA_DISTANCE;
    this.audio.setCinematic(false);
    this.setStatus('Launch halo charged! Stand inside it and press JUMP.');
    this.updateUi();
  }

  private ensurePortalActivationFx(planet: Planet): void {
    if (this.portalActivationFx?.parent === planet.launchPad) {
      this.portalActivationFx.visible = true;
      return;
    }
    this.portalActivationFx?.parent?.remove(this.portalActivationFx);
    const fx = new THREE.Group();
    fx.name = 'launch-activation-fx';
    const color = planet.definition.atmosphere;
    const ringMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (const [radius, y] of [[1.36, 0.12], [1.82, 0.24], [2.3, 0.38]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.045, 8, 48), ringMaterial.clone());
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      fx.add(ring);
    }
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.54, 3.8, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xd8fbff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    beam.position.y = 1.9;
    fx.add(beam);
    const light = new THREE.PointLight(color, 15, 14, 2);
    light.position.y = 1.4;
    fx.add(light);
    fx.visible = false;
    planet.launchPad.add(fx);
    this.portalActivationFx = fx;
  }

  private updateCinematic(delta: number): void {
    const cinematic = this.cinematic;
    if (!cinematic) return;
    cinematic.elapsed += delta;
    const duration = 4.35;
    const raw = THREE.MathUtils.clamp(cinematic.elapsed / duration, 0, 1);
    const t = raw * raw * (3 - 2 * raw);
    // Lift the arc away from the launch sphere before crossing the midpoint.
    // World-up alone points inward on a side-facing start normal, which made
    // Nova pass through the planet and disappear behind its depth buffer.
    const middle = cinematic.start.clone().lerp(cinematic.end, 0.5)
      .addScaledVector(this.playerNormal, 18)
      .addScaledVector(WORLD_UP, 34);
    const position = quadraticBezier(cinematic.start, middle, cinematic.end, t);
    const future = quadraticBezier(cinematic.start, middle, cinematic.end, Math.min(1, t + 0.02));
    const velocity = future.sub(position).normalize();
    this.hero.group.position.copy(position);
    // Keep Nova upright while she is in the interplanetary shot. The old
    // orientation projected WORLD_UP across the travel vector; on the steep
    // launch arc that produced a sideways/upsidedown basis. Blend from the
    // source sphere's tangent, through a world-up hero pose, into the
    // destination sphere's tangent only as she reaches the landing beat.
    const launchOrientation = surfaceOrientation(
      this.playerNormal,
      forwardOnNormal(velocity, this.playerNormal, this.playerHeading),
    );
    const uprightOrientation = surfaceOrientation(
      WORLD_UP,
      forwardOnNormal(velocity, WORLD_UP, this.playerHeading),
    );
    const landingOrientation = surfaceOrientation(
      cinematic.destination.definition.startNormal,
      forwardOnNormal(velocity, cinematic.destination.definition.startNormal, this.playerHeading),
    );
    const orientation = launchOrientation.clone().slerp(uprightOrientation, smoothstep(Math.min(1, raw / 0.18)));
    orientation.slerp(landingOrientation, smoothstep(Math.max(0, (raw - 0.78) / 0.22)));
    this.hero.group.quaternion.copy(orientation);
    this.hero.setRunCycle(8, this.elapsed, true);
    // Camera placement follows the rendered hero's actual +Z face, not just
    // the arc tangent. The two can diverge during the vertical middle beat;
    // basing the close-up on this vector guarantees Nova remains readable.
    const heroForward = new THREE.Vector3(0, 0, 1).applyQuaternion(orientation).normalize();

    // Three deliberate camera beats keep the transfer readable: an intimate
    // launch close-up, a wide reveal of the interplanetary route, then a
    // compressed approach that makes the destination feel earned.
    const side = new THREE.Vector3().crossVectors(WORLD_UP, heroForward).normalize();
    if (side.lengthSq() < 0.001) side.set(1, 0, 0);
    const orbit = this.elapsed * 0.72;
    const orbitSide = side.clone().multiplyScalar(Math.sin(orbit));
    const cameraOffset = new THREE.Vector3();
    const cameraTarget = position.clone();
    if (raw < 0.22) {
      const beat = smoothstep(raw / 0.22);
      const openingRadial = this.playerNormal.clone().add(WORLD_UP);
      if (openingRadial.lengthSq() < 0.001) openingRadial.copy(this.playerNormal);
      openingRadial.normalize();
      const openingForward = this.playerHeading.clone().projectOnPlane(openingRadial);
      if (openingForward.lengthSq() < 0.001) openingForward.copy(heroForward).projectOnPlane(openingRadial);
      openingForward.normalize();
      cameraOffset
        // The launch starts on the source sphere's side. Keep the opening
        // camera on a radial, outside-the-planet line before easing into the
        // hero's forward vector; a tangent-heavy offset clips through Luma
        // and loses Nova in the first half-second.
        .addScaledVector(openingRadial, THREE.MathUtils.lerp(12, 14, beat))
        .addScaledVector(openingForward, THREE.MathUtils.lerp(4, 5.5, beat));
      cameraTarget.addScaledVector(openingRadial, 0.8).addScaledVector(WORLD_UP, 0.72);
      this.setCinematicCopy('ORBITAL SLINGSHOT', 'Charging the next world…');
    } else if (raw < 0.62) {
      const beat = smoothstep((raw - 0.22) / 0.4);
      cameraOffset
        .addScaledVector(heroForward, THREE.MathUtils.lerp(15, 22, beat))
        .addScaledVector(WORLD_UP, THREE.MathUtils.lerp(8, 18, beat))
        .addScaledVector(orbitSide, THREE.MathUtils.lerp(8, 15, beat));
      cameraTarget.copy(position).lerp(cinematic.start.clone().lerp(cinematic.end, 0.5), 0.24);
      this.setCinematicCopy('STAR TRAIL', 'Crossing the interplanetary dark…');
    } else {
      const beat = smoothstep((raw - 0.62) / 0.38);
      cameraOffset
        .addScaledVector(heroForward, THREE.MathUtils.lerp(17, 4.5, beat))
        .addScaledVector(cinematic.destination.definition.startNormal, THREE.MathUtils.lerp(10, 4.5, beat))
        .addScaledVector(WORLD_UP, THREE.MathUtils.lerp(13, 3.5, beat))
        .addScaledVector(orbitSide, THREE.MathUtils.lerp(10, 3.2, beat));
      cameraTarget.addScaledVector(velocity, THREE.MathUtils.lerp(4.2, 0.8, beat)).addScaledVector(WORLD_UP, 1.2);
      this.setCinematicCopy('LANDING VECTOR', `${cinematic.destination.definition.name} ahead.`);
    }
    // Cut quickly into the shot so the first close-up does not inherit the
    // title camera's distant orbit and clip Nova against the frame edge.
    this.camera.position.lerp(position.clone().add(cameraOffset), 1 - Math.exp(-11.5 * delta));
    this.camera.up.copy(WORLD_UP);
    this.camera.lookAt(cameraTarget);

    if (raw < 1) return;
    this.activePlanet = cinematic.destination;
    this.placePlayerAt(this.activePlanet, this.activePlanet.definition.startNormal);
    this.cameraDistance = DEFAULT_CAMERA_DISTANCE;
    this.cinematic = undefined;
    this.phase = 'playing';
    this.cinematicOverlay.classList.remove('is-active');
    this.cinematicOverlay.classList.remove('is-defeat');
    this.hud.classList.remove('is-hidden');
    this.input?.setVisible(true);
    this.audio.setCinematic(false);
    this.audio.setBossTheme(this.activePlanet.isBossPlanet);
    this.setStatus(`${this.activePlanet.definition.name} reached. The next route is all yours.`);
  }

  private beginDefeat(): void {
    const facing = forwardOnNormal(this.playerHeading, WORLD_UP, new THREE.Vector3(0, 0, 1));
    // Tip Nova around the tangent side-axis of the sphere. The previous
    // world-up axis kept the portrait readable, but let the rig's feet and
    // torso rotate into a side-facing planet during the fall.
    const fallAxis = new THREE.Vector3().crossVectors(this.playerNormal, facing).normalize();
    if (fallAxis.lengthSq() < 0.001) fallAxis.set(1, 0, 0);
    this.phase = 'defeat';
    this.defeatCinematic = {
      origin: this.playerPosition.clone(),
      normal: this.playerNormal.clone(),
      heading: facing,
      fallAxis,
      elapsed: 0,
      retryReady: false,
      animationFrozen: false,
    };
    this.defeatFx.visible = true;
    this.cinematicOverlay.classList.add('is-active', 'is-defeat');
    this.defeatRetryButton.parentElement?.classList.remove('is-visible');
    this.hud.classList.add('is-hidden');
    // Remove the shadow-DOM touch layer completely for the defeat overlay. A
    // transparent host can otherwise sit above the retry CTA in mobile WebKit
    // hit testing even when pointer-events is disabled.
    this.input?.destroy();
    this.input = undefined;
    this.setCinematicCopy('STARLIGHT DOWN', 'The rescue beacon is calling Nova home.');
    this.audio.setBossTheme(false);
    this.audio.setCinematic(true);
    // The authored hit clip is a loop by default. Defeat is a single beat,
    // so play it once and hold its final frame instead of letting the rig
    // keep cycling while the camera finishes its orbit.
    const hurtAction = this.modelActions.get('hurt');
    if (hurtAction) {
      this.activeAnimation?.fadeOut(0.14);
      hurtAction.reset();
      hurtAction.setLoop(THREE.LoopOnce, 1);
      hurtAction.clampWhenFinished = true;
      hurtAction.setEffectiveTimeScale(1);
      hurtAction.setEffectiveWeight(1);
      hurtAction.fadeIn(0.14).play();
      this.activeAnimation = hurtAction;
    } else {
      // If the external rig has no hurt clip, stop the previous looping clip
      // so the procedural fall pose remains completely still.
      this.activeAnimation?.stop();
      this.activeAnimation = undefined;
    }
  }

  private updateDefeat(delta: number): void {
    const cinematic = this.defeatCinematic;
    if (!cinematic) return;
    cinematic.elapsed += delta;
    // Give the loss beat enough time to complete a readable 360-degree camera
    // orbit before handing control back to the player through the retry CTA.
    const duration = 5.2;
    const raw = THREE.MathUtils.clamp(cinematic.elapsed / duration, 0, 1);
    const normal = cinematic.normal;
    const heading = cinematic.heading;
    const side = new THREE.Vector3().crossVectors(normal, heading).normalize();
    if (side.lengthSq() < 0.001) side.set(1, 0, 0);

    // Impact, a visible backward fall, then a quiet final pose. Keep the
    // model's local up aligned to the sphere normal and give the body a small
    // outward cushion; this prevents the rig from visually tunneling through
    // a side-facing sphere while the camera makes its full orbit.
    const impact = 1 - smoothstep(Math.min(1, raw / 0.2));
    const fall = smoothstep(Math.min(1, Math.max(0, (raw - 0.08) / 0.46)));
    const settle = smoothstep(Math.min(1, Math.max(0, (raw - 0.72) / 0.28)));
    const lift = THREE.MathUtils.lerp(0.72, 0.5, settle) + (1 - fall) * 0.18;
    const shake = Math.sin(this.elapsed * 56) * impact * 0.08;
    const position = cinematic.origin.clone()
      .addScaledVector(normal, lift + shake)
      .addScaledVector(heading, -fall * 0.92)
      .addScaledVector(side, Math.sin(this.elapsed * 8) * impact * 0.08);
    this.hero.group.position.copy(position);
    const baseOrientation = surfaceOrientation(normal, heading);
    const fallRotation = new THREE.Quaternion().setFromAxisAngle(cinematic.fallAxis, -fall * Math.PI * 0.42);
    baseOrientation.premultiply(fallRotation);
    this.hero.group.quaternion.copy(baseOrientation);
    this.hero.group.scale.setScalar(THREE.MathUtils.lerp(1.02, 0.96, settle));
    // The imported rig supplies the one-shot fall. The procedural fallback is
    // deliberately held in a grounded pose so no limb keeps oscillating.
    this.hero.setRunCycle(0, this.elapsed, false);
    this.hero.setHurt(raw < 0.52 && Math.floor(this.elapsed * 14) % 2 === 0);

    const fxPosition = this.activePlanet.worldPosition(normal, 0.12);
    this.defeatFx.position.copy(fxPosition);
    this.defeatFx.quaternion.copy(surfaceOrientation(normal, heading));
    const ringPulse = 1 + Math.sin(this.elapsed * 7) * 0.12;
    this.defeatRing.scale.setScalar(ringPulse + fall * 1.9);
    this.defeatCore.scale.setScalar(1 + fall * 1.8);
    this.defeatRingMaterial.opacity = THREE.MathUtils.clamp(0.16 + fall * 0.55 - settle * 0.34, 0, 0.72);
    this.defeatCoreMaterial.opacity = THREE.MathUtils.clamp(0.12 + fall * 0.5 - settle * 0.42, 0, 0.7);

    // Orbit in the planet's tangent plane while keeping a constant outward
    // offset. This completes one full revolution and avoids clipping through
    // the sphere even when Nova falls on a side-facing latitude.
    const orbit = raw * Math.PI * 2;
    const orbitRadius = THREE.MathUtils.lerp(8.8, 10.4, fall);
    const cameraPosition = position.clone()
      .addScaledVector(normal, THREE.MathUtils.lerp(5.2, 6.2, fall))
      .addScaledVector(heading, Math.sin(orbit) * orbitRadius)
      .addScaledVector(side, Math.cos(orbit) * orbitRadius);
    const cameraTarget = position.clone().addScaledVector(WORLD_UP, 1.02);
    this.camera.position.lerp(cameraPosition, 1 - Math.exp(-4.6 * delta));
    this.camera.up.copy(WORLD_UP);
    this.camera.lookAt(cameraTarget);

    if (raw < 0.33) {
      this.setCinematicCopy('STARLIGHT DOWN', 'Nova has fallen.');
    } else if (raw < 0.76) {
      this.setCinematicCopy('LAST LIGHT', 'Nova is out of lives.');
    } else {
      this.setCinematicCopy('RUN ENDED', 'Retry to return to the start beacon.');
    }

    if (raw >= 1 && !cinematic.animationFrozen) {
      // ClampWhenFinished handles normal clips; pausing explicitly also
      // covers rigs whose mixer keeps evaluating a finished action.
      if (this.activeAnimation) this.activeAnimation.paused = true;
      cinematic.animationFrozen = true;
    }
    if (raw < 1 || cinematic.retryReady) return;
    cinematic.retryReady = true;
    this.defeatRetryButton.parentElement?.classList.add('is-visible');
    this.defeatRetryButton.focus({ preventScroll: true });
  }

  private readonly retryRun = (): void => {
    if (this.retrying) return;
    this.retrying = true;
    // Leave a development defeat route before reloading; otherwise the QA
    // harness would immediately replay the cinematic instead of testing the
    // actual retry path.
    const url = new URL(window.location.href);
    url.searchParams.delete('qa');
    window.location.replace(url.toString());
  };

  private beginBossVictory(
    finale = this.activePlanet.allRelicsCollected,
    source: 'rings' | 'boss' = 'boss',
    relic?: Planet['relics'][number],
  ): void {
    const normal = this.playerNormal.clone().normalize();
    const heading = this.playerHeading.clone().projectOnPlane(normal);
    if (heading.lengthSq() < 0.001) heading.copy(WORLD_UP).projectOnPlane(normal);
    heading.normalize();
    // The Warden has already been defeated before either crown can be
    // claimed. Keep its collapse out of the reward composition so it cannot
    // sit between the camera and Nova while the celebration starts.
    if (this.activePlanet.boss?.defeated) {
      this.activePlanet.boss.mesh.visible = false;
      // The arena ring is a separate group, so hide it with the Warden to
      // keep its purple circle from becoming a foreground occluder.
      const bossArena = this.activePlanet.group.getObjectByName('boss arena');
      if (bossArena) bossArena.visible = false;
    }
    this.phase = 'bossVictory';
    const focusDuration = relic ? 2.05 : 0;
    const animationDuration = finale ? 5.8 : 3.6;
    this.bossVictoryCinematic = {
      planet: this.activePlanet,
      // Snap the reward beat to the planet surface even when the relic was
      // collected during a jump. The hero's model origin is at its feet, so
      // this keeps the celebration visibly planted instead of hovering.
      origin: this.activePlanet.worldPosition(normal, 0.08),
      normal,
      heading,
      source,
      relic,
      finale,
      focusDuration,
      animationDuration,
      animationStarted: !relic,
      elapsed: 0,
    };
    if (relic) {
      // collectRelicNear hides the mesh immediately so it cannot be collected
      // twice. Keep it visible for this read-only close-up, then hide it when
      // the camera returns to Nova.
      relic.mesh.visible = true;
      relic.mesh.scale.setScalar(1);
    }
    this.hud.classList.add('is-hidden');
    this.cinematicOverlay.classList.add('is-active', 'is-boss-victory');
    this.input?.setVisible(false);
    this.cinematicOverlay.classList.remove('is-defeat');
    this.setCinematicCopy(
      finale ? 'AURORA CROWN' : 'CROWN AWAKENED',
      finale ? 'Dance beneath the final light.' : 'Nova claims another piece of the light.',
    );
    this.audio.setBossTheme(false);
    this.audio.setCinematic(true);
    if (!relic) this.triggerAnimation('celebrate', animationDuration);
  }

  private updateBossVictory(delta: number): void {
    const cinematic = this.bossVictoryCinematic;
    if (!cinematic) return;
    cinematic.elapsed += delta;
    const duration = cinematic.focusDuration + cinematic.animationDuration;
    const raw = THREE.MathUtils.clamp(cinematic.elapsed / duration, 0, 1);
    const inFocus = Boolean(cinematic.relic && cinematic.elapsed < cinematic.focusDuration);
    const playerRaw = cinematic.focusDuration > 0
      ? THREE.MathUtils.clamp((cinematic.elapsed - cinematic.focusDuration) / cinematic.animationDuration, 0, 1)
      : raw;
    const beat = smoothstep(playerRaw);
    const normal = cinematic.normal;
    const heading = cinematic.heading;
    // Keep Nova's feet on the sphere for the whole reward beat. The authored
    // celebrate clip provides the motion; moving the root along the normal
    // made the character float above (or clip into) side-facing planets.
    const position = cinematic.origin.clone();
    this.hero.group.position.copy(position);
    // Align local up to the sphere normal: this is the character's actual
    // ground plane, so the celebration stays right-side-up on every latitude.
    const cinematicForward = forwardOnNormal(heading, normal, new THREE.Vector3(0, 0, 1));
    this.hero.group.quaternion.copy(surfaceOrientation(normal, cinematicForward));
    this.hero.setRunCycle(0, this.elapsed, false);

    if (cinematic.relic) {
      // Planet.update() correctly hides collected relics during gameplay. The
      // reward shot is the one intentional exception: show the collected
      // crown while the camera is locked to it, then hide it before returning
      // to the player so the world state still says "claimed".
      cinematic.relic.mesh.visible = inFocus;
      if (inFocus) {
        const crownNormal = cinematic.relic.normal.clone().normalize();
        const crownPosition = cinematic.planet.worldPosition(crownNormal, 1.28);
        const crownForward = forwardOnNormal(heading, crownNormal, new THREE.Vector3(0, 0, 1));
        const crownSide = new THREE.Vector3().crossVectors(crownNormal, crownForward).normalize();
        if (crownSide.lengthSq() < 0.001) crownSide.set(1, 0, 0);
        const crownBeat = smoothstep(cinematic.elapsed / cinematic.focusDuration);
        const crownOrbit = cinematic.elapsed * 1.35;
        const crownCamera = crownPosition.clone()
          .addScaledVector(crownNormal, THREE.MathUtils.lerp(5.7, 4.35, crownBeat))
          .addScaledVector(crownSide, Math.sin(crownOrbit) * THREE.MathUtils.lerp(1.8, 2.5, crownBeat))
          .addScaledVector(crownForward, Math.cos(crownOrbit) * 1.1);
        this.camera.position.lerp(crownCamera, 1 - Math.exp(-10 * delta));
        this.camera.up.copy(crownNormal);
        this.camera.lookAt(crownPosition.clone().addScaledVector(crownNormal, 0.18));
        this.setCinematicCopy('CROWN AWAKENED', cinematic.source === 'rings'
          ? 'The ring relic answers Nova.'
          : 'The Warden relic answers Nova.');
      }
      if (!cinematic.animationStarted && cinematic.elapsed >= cinematic.focusDuration) {
        cinematic.animationStarted = true;
        this.triggerAnimation('celebrate', cinematic.animationDuration);
      }
    }

    if (inFocus) return;

    const orbit = this.elapsed * 0.9;
    const cameraSide = new THREE.Vector3().crossVectors(normal, cinematicForward).normalize();
    if (cameraSide.lengthSq() < 0.001) cameraSide.set(1, 0, 0);
    const cameraPosition = position.clone()
      // Keep the camera on an outward-normal line so the Warden cannot sit
      // between Nova and the lens during the crown beat. A small tangent
      // offset adds motion without turning the reward into an occlusion shot.
      .addScaledVector(normal, THREE.MathUtils.lerp(13.5, 16.5, beat))
      .addScaledVector(cameraSide, Math.sin(orbit) * THREE.MathUtils.lerp(4.2, 6.4, beat))
      .addScaledVector(cinematicForward, 2.4 + Math.cos(orbit) * 1.1);
    // Aim slightly above Nova's helmet so the model settles low in frame,
    // beneath the title card, while the sphere-normal still controls screen
    // up. A faster ease keeps the first reward beat from starting in the
    // previous follow-camera pose.
    const cameraTarget = position.clone().addScaledVector(normal, 1.45);
    this.camera.position.lerp(cameraPosition, 1 - Math.exp(-9 * delta));
    this.camera.up.copy(normal);
    this.camera.lookAt(cameraTarget);

    if (!cinematic.finale && playerRaw < 0.34) {
      this.setCinematicCopy('CROWN AWAKENED', cinematic.source === 'rings'
        ? 'The ring relic answers Nova.'
        : 'The Warden relic answers Nova.');
    } else if (!cinematic.finale && playerRaw < 0.78) {
      this.setCinematicCopy('AURORA CROWN', 'One relic secured. The next light is still out there.');
    } else if (playerRaw < 0.34) {
      this.setCinematicCopy('AURORA CROWN', 'The Warden yields to Nova.');
    } else if (playerRaw < 0.78) {
      this.setCinematicCopy('CROWN OF LIGHT', 'Dance beneath the final light.');
    } else {
      this.setCinematicCopy('STARBOUND CHAMPION', 'The galaxy remembers this run.');
    }

    if (raw < 1) return;
    if (cinematic.relic) cinematic.relic.mesh.visible = false;
    this.bossVictoryCinematic = undefined;
    this.hero.group.scale.setScalar(1);
    this.cinematicOverlay.classList.remove('is-active', 'is-boss-victory');
    if (!cinematic.finale) {
      this.phase = 'playing';
      this.hud.classList.remove('is-hidden');
      this.input?.setVisible(true);
      this.cameraDistance = DEFAULT_CAMERA_DISTANCE;
      this.audio.setCinematic(false);
      this.audio.setBossTheme(this.activePlanet.isBossPlanet && !this.activePlanet.isBossDefeated);
      this.setCharacterAnimation('idle');
      this.setStatus(`Aurora Crown relic claimed (${this.activePlanet.relicsCollected}/${this.activePlanet.relics.length}). Find the other crown.`);
      this.updateUi();
      return;
    }
    this.phase = 'complete';
    this.hud.classList.add('is-hidden');
    this.audio.setCinematic(false);
    this.completeScreen.classList.remove('is-hidden');
    this.updateUi();
  }

  private setCinematicCopy(title: string, subtitle: string): void {
    this.cinematicTitle.textContent = title;
    this.cinematicSubtitle.textContent = subtitle;
  }

  private configureQaScenario(): void {
    if (!import.meta.env.DEV) return;
    const scenario = new URLSearchParams(window.location.search).get('qa');
    if (scenario !== 'boss' && scenario !== 'victory' && scenario !== 'crown' && scenario !== 'launch' && scenario !== 'portal' && scenario !== 'defeat') return;
    if (scenario === 'launch') {
      const source = this.planets[0];
      const destination = this.planets[1];
      if (!source || !destination) return;
      this.activePlanet = source;
      for (const planet of this.planets) planet.group.visible = planet === source || planet === destination;
      for (const coin of source.coins) {
        coin.collected = true;
        coin.mesh.visible = false;
      }
      this.coins = Math.max(this.coins, source.coinTarget);
      this.placePlayerAt(source, source.definition.launchNormal);
      this.beginLaunch();
      return;
    }
    if (scenario === 'portal') {
      const source = this.planets[0];
      if (!source) return;
      this.activePlanet = source;
      for (const planet of this.planets) planet.group.visible = planet === source;
      for (const coin of source.coins) {
        coin.collected = true;
        coin.mesh.visible = false;
      }
      this.coins = Math.max(this.coins, source.coinTarget);
      this.placePlayerAt(source, source.definition.startNormal);
      this.portalActivationShown.add(source);
      this.beginPortalActivation();
      return;
    }
    if (scenario === 'defeat') {
      const source = this.planets[0];
      if (!source) return;
      this.activePlanet = source;
      for (const planet of this.planets) planet.group.visible = planet === source;
      this.placePlayerAt(source, source.definition.startNormal);
      this.cameraDistance = 13;
      this.health = 0;
      this.setStatus('QA defeat cinematic: Nova has no lives left.');
      this.beginDefeat();
      return;
    }
    const finalPlanet = this.planets[this.planets.length - 1];
    if (!finalPlanet?.definition.bossNormal) return;
    this.activePlanet = finalPlanet;
    for (const planet of this.planets) planet.group.visible = planet === finalPlanet;
    const arenaNormal = finalPlanet.definition.bossNormal;
    const offsetAxis = new THREE.Vector3().crossVectors(arenaNormal, WORLD_UP).normalize();
    if (offsetAxis.lengthSq() < 0.001) offsetAxis.set(1, 0, 0);
    const playerNormal = arenaNormal.clone().applyAxisAngle(offsetAxis, -0.34).normalize();
    this.placePlayerAt(finalPlanet, playerNormal);
    this.playerHeading.copy(arenaNormal).projectOnPlane(playerNormal).normalize();
    this.cameraHeading.copy(this.playerHeading);
    this.hero.group.quaternion.copy(surfaceOrientation(this.playerNormal, this.playerHeading));
    this.cameraDistance = 13;
    this.audio.setBossTheme(true);
    if (scenario === 'crown') {
      for (const coin of finalPlanet.coins.slice(0, finalPlanet.relicRingTarget)) {
        if (coin.collected) continue;
        coin.collected = true;
        coin.mesh.visible = false;
        this.coins += 1;
      }
      // Keep the deterministic crown capture representative of the actual
      // reward beat: the Warden has fallen, then the ring relic is claimed.
      if (finalPlanet.boss && !finalPlanet.boss.defeated) {
        finalPlanet.damageBoss(finalPlanet.boss.health);
      }
      const ringRelic = finalPlanet.relics.find((relic) => relic.source === 'rings');
      if (ringRelic) {
        this.placePlayerAt(finalPlanet, ringRelic.normal);
        this.playerHeading.copy(arenaNormal).projectOnPlane(this.playerNormal).normalize();
        this.cameraHeading.copy(this.playerHeading);
        finalPlanet.collectRelicNear(ringRelic.normal, 0.5);
        this.beginBossVictory(false, 'rings', ringRelic);
      }
      return;
    }
    this.setStatus(scenario === 'boss' ? 'QA boss arena: pounce the Crown Warden.' : 'QA victory cinematic: both Crown relics claimed.');
    if (scenario !== 'victory' || !finalPlanet.boss) return;
    for (const coin of finalPlanet.coins.slice(0, finalPlanet.relicRingTarget)) {
      if (coin.collected) continue;
      coin.collected = true;
      coin.mesh.visible = false;
      this.coins += 1;
    }
    finalPlanet.damageBoss(finalPlanet.boss.health);
    let finalRelic: Planet['relics'][number] | undefined;
    while (!finalPlanet.allRelicsCollected && (finalRelic = finalPlanet.collectRelicNear(arenaNormal, 4))) {
      // Collect both QA relics at the shared arena so the full payoff can be inspected.
    }
    if (finalPlanet.allRelicsCollected) this.beginBossVictory(true, finalRelic?.source ?? 'boss', finalRelic);
  }

  private updateTitleCamera(delta: number): void {
    const orbit = this.elapsed * 0.1;
    const target = this.activePlanet.definition.center;
    const desired = new THREE.Vector3(
      Math.cos(orbit) * 27,
      17 + Math.sin(orbit * 0.8) * 4,
      Math.sin(orbit) * 27,
    ).add(target);
    this.camera.position.lerp(desired, 1 - Math.exp(-1.8 * delta));
    this.camera.up.copy(WORLD_UP);
    this.camera.lookAt(target);
  }

  private updateCompleteCamera(delta: number): void {
    const destination = this.activePlanet.definition.center;
    const desired = destination.clone().add(new THREE.Vector3(18, 18, 24));
    this.camera.position.lerp(desired, 1 - Math.exp(-1.7 * delta));
    this.camera.up.copy(WORLD_UP);
    this.camera.lookAt(destination);
  }

  private updateCamera(delta: number): void {
    const forward = this.cameraHeading.clone().projectOnPlane(this.playerNormal).normalize();
    const horizontalDistance = this.cameraDistance * Math.cos(this.cameraPitch);
    const verticalDistance = this.cameraDistance * Math.sin(this.cameraPitch);
    const desired = this.playerPosition.clone()
      .addScaledVector(this.playerNormal, verticalDistance + 1.2)
      // Nova's authored +Z face matches the movement heading. Keep the
      // follow camera on the lead side so forward motion does not read as a
      // backwards-running model from the player's view.
      .addScaledVector(forward, horizontalDistance);
    this.cameraPosition.lerp(desired, 1 - Math.exp(-8 * delta));
    this.camera.position.copy(this.cameraPosition);
    this.camera.up.copy(this.playerNormal);
    this.lookAtTarget.copy(this.playerPosition).addScaledVector(this.playerNormal, 1.15);
    this.camera.lookAt(this.lookAtTarget);
  }

  private placePlayerAt(planet: Planet, normal: THREE.Vector3): void {
    this.playerNormal.copy(normal).normalize();
    this.playerHeading.set(0, 0, 1).projectOnPlane(this.playerNormal);
    if (this.playerHeading.lengthSq() < 0.001) this.playerHeading.set(1, 0, 0).projectOnPlane(this.playerNormal);
    this.playerHeading.normalize();
    this.cameraHeading.copy(this.playerHeading).applyAxisAngle(this.playerNormal, 0.18).projectOnPlane(this.playerNormal).normalize();
    this.playerHeight = 0;
    this.verticalVelocity = 0;
    this.playerPosition.copy(planet.worldPosition(this.playerNormal, 0.08));
    this.hero.group.position.copy(this.playerPosition);
    this.hero.group.quaternion.copy(surfaceOrientation(this.playerNormal, this.playerHeading));
  }

  private updateUi(): void {
    const planet = this.activePlanet;
    this.planetName.textContent = planet.definition.name;
    this.coinText.textContent = `${this.coins.toString().padStart(2, '0')} ✦`;
    this.healthText.textContent = `${'♥'.repeat(this.health)}${'♡'.repeat(3 - this.health)}`;
    const remaining = Math.max(0, planet.coinTarget - planet.collectedCoins);
    this.missionText.textContent = planet.isLaunchReady
      ? 'Launch halo charged — stand inside it and press JUMP.'
      : `Charge the launch halo: ${remaining} star token${remaining === 1 ? '' : 's'} remaining.`;
    if (planet.isBossPlanet) {
      this.relicText.classList.remove('is-hidden');
      this.relicText.textContent = `CROWNS ${planet.relicsCollected}/${planet.relics.length}`;
      const remaining = Math.max(0, planet.relicRingTarget - planet.collectedCoins);
      const collectedRelics = planet.relicsCollected;
      const totalRelics = planet.relics.length;
      this.missionText.textContent = planet.allRelicsCollected
        ? 'Both Aurora Crown relics claimed - Nova is the Starbound Champion.'
        : planet.isRelicReady
          ? `Aurora Crown relics ${collectedRelics}/${totalRelics} - collect the glowing relics at the Warden arena.`
          : collectedRelics > 0
            ? 'Defeat the Crown Warden to claim the second Aurora Crown relic.'
          : `Defeat the Crown Warden or collect ${remaining} more ring${remaining === 1 ? '' : 's'} to awaken a relic.`;
    } else {
      this.relicText.classList.add('is-hidden');
      this.relicText.textContent = '';
    }
    if (planet.isBossPlanet && planet.boss) {
      this.bossCard.classList.remove('is-hidden');
      const healthRatio = planet.boss.health / planet.boss.maxHealth;
      this.bossMeterFill.style.width = `${Math.round(healthRatio * 100)}%`;
      this.bossMeterText.textContent = planet.boss.defeated
        ? `WARDEN DEFEATED | ${planet.relicsCollected}/${planet.relics.length} RELICS`
        : `${planet.boss.health}/${planet.boss.maxHealth} ARMOR${planet.boss.attackPhase === 'telegraph' ? ' | CHARGING' : ''} | ${planet.relicsCollected}/${planet.relics.length} RELICS`;
    } else {
      this.bossCard.classList.add('is-hidden');
    }
    if (window.location.search.includes('debug=1')) {
      this.debugText.classList.add('is-visible');
      const info = this.renderer.info;
      const audio = this.audio.debugSnapshot();
      this.debugText.textContent = `${Math.round(this.fps)} FPS | ${info.render.calls} calls | ${info.render.triangles.toLocaleString()} tris | ${info.memory.geometries} geo | audio:${audio.musicSource}/${audio.contextState}/${audio.musicPaused ? 'paused' : 'playing'} | ready:${audio.musicReadyState} | err:${audio.musicError}`;
    }
  }

  private setStatus(message: string): void {
    this.statusText.textContent = message;
  }

  private debugSnapshot(): StarboundDebugSnapshot {
    const info = this.renderer.info;
    const launchEnergy = this.activePlanet.launchPad.getObjectByName('launch-energy-circle') as THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial> | undefined;
    return {
      phase: this.phase,
      currentPlanet: this.activePlanet.definition.id,
      playerPosition: [this.playerPosition.x, this.playerPosition.y, this.playerPosition.z],
      health: this.health,
      coins: this.coins,
      planetsCompleted: this.planets.indexOf(this.activePlanet),
      loadedAssetIds: this.loadedAssetIds,
      assetErrors: this.assetErrors,
      launch: {
        ready: this.activePlanet.isLaunchReady,
        portalVisible: this.activePlanet.launchPad.visible,
        energyOpacity: launchEnergy?.material.opacity ?? 0,
      },
      boss: this.activePlanet.boss
        ? {
          health: this.activePlanet.boss.health,
          maxHealth: this.activePlanet.boss.maxHealth,
          defeated: this.activePlanet.boss.defeated,
          attackPhase: this.activePlanet.boss.attackPhase,
          attackCooldown: this.activePlanet.boss.attackCooldown,
          relicsReady: this.activePlanet.relicsReady,
          relicsCollected: this.activePlanet.relicsCollected,
          relicsTotal: this.activePlanet.relics.length,
        }
        : undefined,
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      audio: this.audio.debugSnapshot(),
    };
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.root.clientWidth);
    const height = Math.max(1, this.root.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private async loadCharacterModel(): Promise<void> {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const load = (url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] } | undefined> => new Promise((resolve) => {
        loader.load(url, (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }), undefined, () => resolve(undefined));
      });
      // Quaternius' hazmat explorer better matches the game's colorful space
      // theme. Keep KayKit as a second authored fallback so a CDN/cache miss
      // never exposes the procedural placeholder during normal startup.
      const authored = await load(assetPath('assets/characters/quaternius-hazmat.glb'));
      const fallback = authored ? undefined : await load(assetPath('assets/characters/kaykit-rogue.glb'));
      const imported = authored ?? fallback;
      const model = imported?.scene;
      const clips = imported?.animations ?? [];
      const sourceId = authored ? 'quaternius-hazmat' : fallback ? 'kaykit-rogue' : undefined;
      if (!model || !sourceId) {
        this.assetErrors.push('quaternius-hazmat and kaykit-rogue: failed to load; using the procedural hero');
        this.hero.showFallback();
        return;
      }
      model.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = false;
          node.receiveShadow = false;
        }
        // The toon-shooter GLB contains every gun/knife variant in one file.
        // Keep one compact blaster and one knife for the game's two-slot
        // attack presentation, and hide every other authored weapon branch.
        const isWeaponRoot = /^(Revolver|Sniper|Pistol|SMG|GrenadeLauncher|ShortCannon|Shotgun|RocketLauncher|AK|Shovel|Knife)/.test(node.name)
          && Boolean(node.parent && /Index1R|Index2R|Index3R/.test(node.parent.name));
        if (isWeaponRoot && !/^(Pistol|Knife_1)$/.test(node.name)) {
          node.visible = false;
        }
      });
      const sourceBounds = new THREE.Box3().setFromObject(model);
      const sourceHeight = sourceBounds.getSize(new THREE.Vector3()).y;
      model.scale.setScalar(2.52 / Math.max(0.001, sourceHeight));
      const scaledBounds = new THREE.Box3().setFromObject(model);
      model.position.y = -scaledBounds.min.y;
      this.hero.attachModel(model);
      this.modelMixer = new THREE.AnimationMixer(model);
      const aliases: Record<string, string> = authored
        ? {
          idle: 'CharacterArmature|Idle',
          run: 'CharacterArmature|Run',
          jumpStart: 'CharacterArmature|Jump',
          jumpAir: 'CharacterArmature|Jump_Idle',
          jumpLand: 'CharacterArmature|Jump_Land',
          pounce: 'CharacterArmature|Punch',
          hurt: 'CharacterArmature|HitReact',
          celebrate: 'CharacterArmature|Wave',
        }
        : {
          idle: 'Idle',
          run: 'Running_A',
          jumpStart: 'Jump_Start',
          jumpAir: 'Jump_Full_Long',
          pounce: 'Dualwield_Melee_Attack_Slice',
          hurt: 'Hit_A',
          celebrate: 'Cheer',
        };
      // GLB clips are prefixed with their armature name; findByName keeps the
      // aliases readable and preserves KayKit's legacy names as a fallback.
      for (const [name, clipName] of Object.entries(aliases)) {
        const clip = THREE.AnimationClip.findByName(clips, clipName);
        if (clip) this.modelActions.set(name, this.modelMixer.clipAction(clip));
      }
      this.loadedAssetIds.push(sourceId);
      this.setCharacterAnimation('idle');
    } catch {
      this.assetErrors.push('quaternius-hazmat: loader failed to initialize; using the procedural hero');
      this.hero.showFallback();
    }
  }

  private async loadLaunchPortalModel(): Promise<void> {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      await new Promise<void>((resolve) => {
        loader.load(
          assetPath('assets/portals/kenney-gate-complex.glb'),
          (gltf) => {
            for (const planet of this.planets) planet.attachLaunchPortal(gltf.scene);
            this.loadedAssetIds.push('kenney-gate-complex');
            resolve();
          },
          undefined,
          () => {
            this.assetErrors.push('kenney-gate-complex: failed to load; using procedural launch portal');
            resolve();
          },
        );
      });
    } catch {
      this.assetErrors.push('kenney-gate-complex: loader failed to initialize; using procedural launch portal');
    }
  }

  private async loadRelicModel(): Promise<void> {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      await new Promise<void>((resolve) => {
        loader.load(
          assetPath('assets/relics/quaternius-aurora-crown.glb'),
          (gltf) => {
            for (const planet of this.planets) planet.attachRelicModel(gltf.scene);
            this.loadedAssetIds.push('quaternius-aurora-crown');
            resolve();
          },
          undefined,
          () => {
            this.assetErrors.push('quaternius-aurora-crown: failed to load; using procedural crown aura');
            resolve();
          },
        );
      });
    } catch {
      this.assetErrors.push('quaternius-aurora-crown: loader failed to initialize; using procedural crown aura');
    }
  }

  private readonly finishLoading = async (): Promise<void> => {
    const remaining = MINIMUM_LOADING_SCREEN_DURATION - (performance.now() - this.loadingStartedAt);
    if (remaining > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
    }
    this.characterReady = true;
    this.titleScreen.classList.remove('is-hidden');
    this.loadingScreen.classList.add('is-hidden');
  };

  private triggerAnimation(name: string, duration: number): void {
    this.animationLockedUntil = this.elapsed + duration;
    if (name === 'pounce') this.hero.triggerWeaponAnimation('attack', this.elapsed);
    this.setCharacterAnimation(name);
  }

  private setCharacterAnimation(name: string): void {
    const action = this.modelActions.get(name);
    if (!action || action === this.activeAnimation) return;
    this.activeAnimation?.fadeOut(0.14);
    action.reset();
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.fadeIn(0.14).play();
    this.activeAnimation = action;
  }

  private element<T extends Element = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing Starbound Sprint UI element: ${selector}`);
    return element;
  }

  private template(): string {
    return `
      <section class="game-shell" aria-label="Starbound Sprint game">
        <canvas class="game-canvas" aria-label="Starbound Sprint 3D world"></canvas>
        <div class="screen-vignette" aria-hidden="true"></div>
        <section class="loading-screen" aria-label="Loading Starbound Sprint" aria-live="polite">
          <div class="loading-content">
            <p class="eyebrow">PREPARING YOUR RUN</p>
            <div class="loading-orbit" aria-hidden="true"><span></span></div>
            <p>Loading Nova and her gear&hellip;</p>
          </div>
        </section>
        <header class="hud is-hidden" aria-live="polite">
          <div class="hud-brand"><span>STARBOUND</span><b>SPRINT</b></div>
          <div class="hud-route"><span class="route-label">CURRENT ORBIT</span><strong class="hud-planet"></strong></div>
          <div class="hud-stats"><span class="coin-count"></span><span class="health-count"></span><span class="relic-count is-hidden" aria-label="Aurora Crown relics collected"></span></div>
          <button class="mute-button" type="button" aria-pressed="false">SOUND ON</button>
          <section class="mission-card"><span class="mission-label">OBJECTIVE</span><p class="mission-copy"></p></section>
          <section class="boss-card is-hidden" aria-live="polite"><div class="boss-card-heading"><span class="mission-label">CROWN WARDEN</span><strong class="boss-meter-text"></strong></div><div class="boss-meter"><i class="boss-meter-fill"></i></div></section>
          <p class="status-copy"></p>
          <p class="debug-panel" aria-live="off"></p>
        </header>
        <section class="cinematic-overlay" aria-live="assertive"><p>ORBITAL SLINGSHOT</p><span>Hold tight, runner.</span><div class="defeat-actions"><button class="defeat-retry-button" type="button">RETRY RUN</button></div></section>
        <section class="title-screen is-hidden">
          <div class="title-orbit orbit-one"></div><div class="title-orbit orbit-two"></div>
          <div class="title-content">
            <p class="eyebrow">A MOBILE COSMIC PLATFORMER</p>
            <h1><span>STARBOUND</span> SPRINT</h1>
            <p class="title-copy">Run every curve. Collect the light. Leap between living worlds.</p>
            <button class="start-button" type="button">START THE RUN <span>✦</span></button>
            <p class="controls-copy">Left stick to move · drag right to orbit · JUMP to soar · ATTACK / F to strike</p>
          </div>
        </section>
        <section class="complete-screen is-hidden">
          <p class="eyebrow">FINAL ORBIT COMPLETE</p>
          <h2>THE <span>AURORA CROWN</span> IS YOURS.</h2>
          <p>Both Aurora Crown relics secured, ${this.coins} rings gathered, and the Crown Warden's light now follows Nova.</p>
          <button class="restart-button" type="button">RUN IT AGAIN</button>
        </section>
      </section>`;
  }
}

function quadraticBezier(start: THREE.Vector3, control: THREE.Vector3, end: THREE.Vector3, t: number): THREE.Vector3 {
  const inverse = 1 - t;
  return start.clone().multiplyScalar(inverse * inverse)
    .addScaledVector(control, 2 * inverse * t)
    .addScaledVector(end, t * t);
}

function smoothstep(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Return a stable tangent for a cinematic orientation. A launch can be
 * momentarily vertical, which leaves a zero-length projection; keeping the
 * previous heading in that case prevents quaternion NaNs and upside-down
 * model flips.
 */
function forwardOnNormal(
  direction: THREE.Vector3,
  normal: THREE.Vector3,
  fallback: THREE.Vector3,
): THREE.Vector3 {
  const forward = direction.clone().projectOnPlane(normal);
  if (forward.lengthSq() < 0.0001) forward.copy(fallback).projectOnPlane(normal);
  if (forward.lengthSq() < 0.0001) forward.set(0, 0, 1).projectOnPlane(normal);
  if (forward.lengthSq() < 0.0001) forward.set(1, 0, 0).projectOnPlane(normal);
  return forward.normalize();
}
