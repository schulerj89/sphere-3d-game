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

type GamePhase = 'title' | 'playing' | 'cinematic' | 'defeat' | 'complete';

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
  readonly renderer: {
    readonly calls: number;
    readonly triangles: number;
    readonly geometries: number;
    readonly textures: number;
  };
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
  private defeatCinematic: DefeatCinematic | undefined;
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
  private trailCooldown = 0;
  private fps = 60;
  private muted = false;
  private modelMixer: THREE.AnimationMixer | undefined;
  private activeAnimation: THREE.AnimationAction | undefined;
  private readonly modelActions = new Map<string, THREE.AnimationAction>();
  private animationLockedUntil = 0;
  private characterReady = false;
  private loadingStartedAt = 0;
  private readonly loadedAssetIds = ['procedural-planets', 'procedural-hero'];
  private readonly assetErrors: string[] = [];

  private loadingScreen!: HTMLElement;
  private titleScreen!: HTMLElement;
  private hud!: HTMLElement;
  private cinematicOverlay!: HTMLElement;
  private cinematicTitle!: HTMLElement;
  private cinematicSubtitle!: HTMLElement;
  private completeScreen!: HTMLElement;
  private planetName!: HTMLElement;
  private missionText!: HTMLElement;
  private coinText!: HTMLElement;
  private healthText!: HTMLElement;
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
    this.completeScreen = this.element('.complete-screen');
    this.planetName = this.element('.hud-planet');
    this.missionText = this.element('.mission-copy');
    this.coinText = this.element('.coin-count');
    this.healthText = this.element('.health-count');
    this.statusText = this.element('.status-copy');
    this.debugText = this.element('.debug-panel');
    this.muteButton = this.element<HTMLButtonElement>('.mute-button');

    this.configureScene();
    this.bindUi();
    this.resize();
    this.updateUi();
    void this.loadCharacterModel().then(this.finishLoading);
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
    for (const planet of this.planets) planet.update(delta);

    if (this.phase === 'playing') {
      this.updatePlaying(delta);
    } else if (this.phase === 'cinematic') {
      this.updateCinematic(delta);
    } else if (this.phase === 'defeat') {
      this.updateDefeat(delta);
    } else if (this.phase === 'title') {
      this.updateTitleCamera(delta);
    } else {
      this.updateCompleteCamera(delta);
    }

    this.renderer.render(this.scene, this.camera);
  };

  private updatePlaying(delta: number): void {
    this.updateCameraInput();
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
    const collected = this.activePlanet.collectNear(this.playerNormal, 1.24);
    if (collected) {
      this.coins += 1;
      this.audio.play('coin');
      const remaining = Math.max(0, this.activePlanet.coinTarget - this.activePlanet.collectedCoins);
      this.setStatus(remaining === 0 ? 'Launch halo charged! Stand inside and press JUMP.' : `${remaining} more star tokens to charge the launch halo.`);
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

  private beginLaunch(): void {
    const planetIndex = this.planets.indexOf(this.activePlanet);
    const destination = this.planets[planetIndex + 1];
    if (!destination) {
      this.phase = 'complete';
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
    this.setCinematicCopy('ORBITAL SLINGSHOT', 'Hold tight, runner.');
    this.audio.play('launch');
    this.audio.setCinematic(true);
    this.setStatus(`Slingshotting to ${destination.definition.name}…`);
  }

  private updateCinematic(delta: number): void {
    const cinematic = this.cinematic;
    if (!cinematic) return;
    cinematic.elapsed += delta;
    const duration = 4.35;
    const raw = THREE.MathUtils.clamp(cinematic.elapsed / duration, 0, 1);
    const t = raw * raw * (3 - 2 * raw);
    const middle = cinematic.start.clone().lerp(cinematic.end, 0.5).add(new THREE.Vector3(0, 34, 0));
    const position = quadraticBezier(cinematic.start, middle, cinematic.end, t);
    const future = quadraticBezier(cinematic.start, middle, cinematic.end, Math.min(1, t + 0.02));
    const velocity = future.sub(position).normalize();
    this.hero.group.position.copy(position);
    const cinematicNormal = velocity.clone().cross(WORLD_UP).cross(velocity).normalize();
    if (cinematicNormal.lengthSq() < 0.001) cinematicNormal.copy(WORLD_UP);
    this.hero.group.quaternion.copy(surfaceOrientation(cinematicNormal, velocity));
    this.hero.setRunCycle(8, this.elapsed, true);

    // Three deliberate camera beats keep the transfer readable: an intimate
    // launch close-up, a wide reveal of the interplanetary route, then a
    // compressed approach that makes the destination feel earned.
    const side = new THREE.Vector3().crossVectors(WORLD_UP, velocity).normalize();
    if (side.lengthSq() < 0.001) side.set(1, 0, 0);
    const orbit = this.elapsed * 0.72;
    const orbitSide = side.clone().multiplyScalar(Math.sin(orbit));
    const cameraOffset = new THREE.Vector3();
    const cameraTarget = position.clone();
    if (raw < 0.22) {
      const beat = smoothstep(raw / 0.22);
      cameraOffset
        .addScaledVector(velocity, THREE.MathUtils.lerp(-4.4, -8.5, beat))
        .addScaledVector(WORLD_UP, THREE.MathUtils.lerp(1.4, 4.5, beat))
        .addScaledVector(orbitSide, THREE.MathUtils.lerp(1.8, 4.5, beat));
      cameraTarget.addScaledVector(velocity, 1.9).addScaledVector(WORLD_UP, 1.15);
      this.setCinematicCopy('ORBITAL SLINGSHOT', 'Charging the next worldâ€¦');
    } else if (raw < 0.62) {
      const beat = smoothstep((raw - 0.22) / 0.4);
      cameraOffset
        .addScaledVector(velocity, THREE.MathUtils.lerp(-15, -22, beat))
        .addScaledVector(WORLD_UP, THREE.MathUtils.lerp(8, 18, beat))
        .addScaledVector(orbitSide, THREE.MathUtils.lerp(8, 15, beat));
      cameraTarget.copy(position).lerp(cinematic.start.clone().lerp(cinematic.end, 0.5), 0.24);
      this.setCinematicCopy('STAR TRAIL', 'Crossing the interplanetary darkâ€¦');
    } else {
      const beat = smoothstep((raw - 0.62) / 0.38);
      cameraOffset
        .addScaledVector(velocity, THREE.MathUtils.lerp(-17, 4, beat))
        .addScaledVector(WORLD_UP, THREE.MathUtils.lerp(13, 3.5, beat))
        .addScaledVector(orbitSide, THREE.MathUtils.lerp(10, 3.2, beat));
      cameraTarget.addScaledVector(velocity, THREE.MathUtils.lerp(5, 1.2, beat)).addScaledVector(WORLD_UP, 1.2);
      this.setCinematicCopy('LANDING VECTOR', `${cinematic.destination.definition.name} ahead.`);
    }
    this.camera.position.lerp(position.clone().add(cameraOffset), 1 - Math.exp(-4.8 * delta));
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
    this.audio.setCinematic(false);
    this.setStatus(`${this.activePlanet.definition.name} reached. The next route is all yours.`);
  }

  private beginDefeat(): void {
    this.phase = 'defeat';
    this.defeatCinematic = {
      origin: this.playerPosition.clone(),
      normal: this.playerNormal.clone(),
      heading: this.playerHeading.clone(),
      elapsed: 0,
    };
    this.defeatFx.visible = true;
    this.cinematicOverlay.classList.add('is-active', 'is-defeat');
    this.hud.classList.add('is-hidden');
    this.setCinematicCopy('STARLIGHT DOWN', 'The rescue beacon is calling Nova home.');
    this.audio.setCinematic(true);
  }

  private updateDefeat(delta: number): void {
    const cinematic = this.defeatCinematic;
    if (!cinematic) return;
    cinematic.elapsed += delta;
    const duration = 3.9;
    const raw = THREE.MathUtils.clamp(cinematic.elapsed / duration, 0, 1);
    const normal = cinematic.normal;
    const heading = cinematic.heading;
    const side = new THREE.Vector3().crossVectors(normal, heading).normalize();
    if (side.lengthSq() < 0.001) side.set(1, 0, 0);

    // Impact, weightless drift, then a soft beacon pull. The hero stays on
    // screen for the entire beat so the loss reads as a character moment.
    const impact = 1 - smoothstep(Math.min(1, raw / 0.2));
    const drift = smoothstep(Math.min(1, Math.max(0, (raw - 0.16) / 0.56)));
    const returnBeat = smoothstep(Math.min(1, Math.max(0, (raw - 0.72) / 0.28)));
    const lift = THREE.MathUtils.lerp(0.12, 2.65, drift) * (1 - returnBeat * 0.42);
    const shake = Math.sin(this.elapsed * 56) * impact * 0.08;
    const position = cinematic.origin.clone()
      .addScaledVector(normal, lift + shake)
      .addScaledVector(side, Math.sin(this.elapsed * 8) * impact * 0.08);
    this.hero.group.position.copy(position);
    const facing = heading.clone().applyAxisAngle(normal, THREE.MathUtils.lerp(0, Math.PI * 1.35, drift));
    this.hero.group.quaternion.copy(surfaceOrientation(normal, facing));
    const scale = THREE.MathUtils.lerp(1.02, 0.72, returnBeat);
    this.hero.group.scale.setScalar(scale);
    this.hero.setRunCycle(0, this.elapsed, true);
    this.hero.setHurt(raw < 0.52 && Math.floor(this.elapsed * 14) % 2 === 0);
    if (raw < 0.48) this.setCharacterAnimation('hurt');

    const fxPosition = this.activePlanet.worldPosition(normal, 0.12);
    this.defeatFx.position.copy(fxPosition);
    this.defeatFx.quaternion.copy(surfaceOrientation(normal, heading));
    const ringPulse = 1 + Math.sin(this.elapsed * 7) * 0.12;
    this.defeatRing.scale.setScalar(ringPulse + drift * 1.9);
    this.defeatCore.scale.setScalar(1 + drift * 1.8);
    this.defeatRingMaterial.opacity = THREE.MathUtils.clamp(0.16 + drift * 0.55 - returnBeat * 0.34, 0, 0.72);
    this.defeatCoreMaterial.opacity = THREE.MathUtils.clamp(0.12 + drift * 0.5 - returnBeat * 0.42, 0, 0.7);

    const cameraPosition = position.clone()
      .addScaledVector(normal, THREE.MathUtils.lerp(5.7, 12.8, drift))
      .addScaledVector(heading, THREE.MathUtils.lerp(3.8, -1.5, drift))
      .addScaledVector(side, Math.sin(this.elapsed * 1.6) * THREE.MathUtils.lerp(0.8, 4.8, drift));
    const cameraTarget = position.clone().addScaledVector(normal, 1.05);
    this.camera.position.lerp(cameraPosition, 1 - Math.exp(-4.6 * delta));
    this.camera.up.copy(WORLD_UP);
    this.camera.lookAt(cameraTarget);

    if (raw < 0.33) {
      this.setCinematicCopy('STARLIGHT DOWN', 'Nova has fallen.');
    } else if (raw < 0.76) {
      this.setCinematicCopy('RESCUE BEACON', 'Hold on to the light.');
    } else {
      this.setCinematicCopy('REENTRY', 'The run continues.');
    }

    if (raw < 1) return;
    this.health = 3;
    this.hero.group.scale.setScalar(1);
    this.defeatFx.visible = false;
    this.defeatRingMaterial.opacity = 0;
    this.defeatCoreMaterial.opacity = 0;
    this.placePlayerAt(this.activePlanet, this.activePlanet.definition.startNormal);
    this.defeatCinematic = undefined;
    this.phase = 'playing';
    this.cinematicOverlay.classList.remove('is-active', 'is-defeat');
    this.hud.classList.remove('is-hidden');
    this.audio.setCinematic(false);
    this.setCharacterAnimation('idle');
    this.setStatus('Rescue star restored you to the start beacon.');
    this.updateUi();
  }

  private setCinematicCopy(title: string, subtitle: string): void {
    this.cinematicTitle.textContent = title;
    this.cinematicSubtitle.textContent = subtitle;
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
    if (window.location.search.includes('debug=1')) {
      this.debugText.classList.add('is-visible');
      const info = this.renderer.info;
      this.debugText.textContent = `${Math.round(this.fps)} FPS · ${info.render.calls} calls · ${info.render.triangles.toLocaleString()} tris · ${info.memory.geometries} geo`;
    }
  }

  private setStatus(message: string): void {
    this.statusText.textContent = message;
  }

  private debugSnapshot(): StarboundDebugSnapshot {
    const info = this.renderer.info;
    return {
      phase: this.phase,
      currentPlanet: this.activePlanet.definition.id,
      playerPosition: [this.playerPosition.x, this.playerPosition.y, this.playerPosition.z],
      health: this.health,
      coins: this.coins,
      planetsCompleted: this.planets.indexOf(this.activePlanet),
      loadedAssetIds: this.loadedAssetIds,
      assetErrors: this.assetErrors,
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
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
      await new Promise<void>((resolve) => {
        loader.load(
          assetPath('assets/characters/kaykit-rogue.glb'),
          (gltf) => {
            try {
              const model = gltf.scene;
              model.traverse((node) => {
                if (node instanceof THREE.Mesh) {
                  node.castShadow = false;
                  node.receiveShadow = false;
                }
              });
              const sourceBounds = new THREE.Box3().setFromObject(model);
              const sourceHeight = sourceBounds.getSize(new THREE.Vector3()).y;
              model.scale.setScalar(2.52 / Math.max(0.001, sourceHeight));
              const scaledBounds = new THREE.Box3().setFromObject(model);
              model.position.y = -scaledBounds.min.y;
              // The KayKit rig already faces +Z, which is the game movement axis.
              this.hero.attachModel(model);
              this.modelMixer = new THREE.AnimationMixer(model);
              const aliases: Record<string, string> = {
                idle: 'Idle',
                run: 'Running_A',
                jumpStart: 'Jump_Start',
                jumpAir: 'Jump_Full_Long',
                // Nova's retained crossbow + offhand knife now use the authored 1H
                // slice instead of an unarmed kick, so the weapons read during impact.
                pounce: '1H_Melee_Attack_Slice_Horizontal',
                hurt: 'Hit_A',
                celebrate: 'Cheer',
              };
              for (const [name, clipName] of Object.entries(aliases)) {
                const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
                if (clip) this.modelActions.set(name, this.modelMixer.clipAction(clip));
              }
              this.loadedAssetIds.push('kaykit-rogue');
              this.setCharacterAnimation('idle');
            } catch (error) {
              this.assetErrors.push(`kaykit-rogue: ${error instanceof Error ? error.message : String(error)}`);
              this.hero.showFallback();
            }
            resolve();
          },
          undefined,
          () => {
            this.assetErrors.push('kaykit-rogue: failed to load; using the procedural hero');
            this.hero.showFallback();
            resolve();
          },
        );
      });
    } catch {
      this.assetErrors.push('kaykit-rogue: loader failed to initialize; using the procedural hero');
      this.hero.showFallback();
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
          <div class="hud-stats"><span class="coin-count"></span><span class="health-count"></span></div>
          <button class="mute-button" type="button" aria-pressed="false">SOUND ON</button>
          <section class="mission-card"><span class="mission-label">OBJECTIVE</span><p class="mission-copy"></p></section>
          <p class="status-copy"></p>
          <p class="debug-panel" aria-live="off"></p>
        </header>
        <section class="cinematic-overlay" aria-live="assertive"><p>ORBITAL SLINGSHOT</p><span>Hold tight, runner.</span></section>
        <section class="title-screen is-hidden">
          <div class="title-orbit orbit-one"></div><div class="title-orbit orbit-two"></div>
          <div class="title-content">
            <p class="eyebrow">A MOBILE COSMIC PLATFORMER</p>
            <h1><span>STARBOUND</span> SPRINT</h1>
            <p class="title-copy">Run every curve. Collect the light. Leap between living worlds.</p>
            <button class="start-button" type="button">START THE RUN <span>✦</span></button>
            <p class="controls-copy">Left stick to move · drag the right side to orbit · pinch to zoom · JUMP to soar</p>
          </div>
        </section>
        <section class="complete-screen is-hidden">
          <p class="eyebrow">DEMO COMPLETE</p>
          <h2>YOU RAN THE <span>STARS.</span></h2>
          <p>Three worlds charted, ${'${this.coins}'} star tokens gathered, and a whole galaxy still waiting.</p>
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
