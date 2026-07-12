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

type GamePhase = 'title' | 'playing' | 'cinematic' | 'complete';

interface LaunchCinematic {
  readonly source: Planet;
  readonly destination: Planet;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
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

export class Game {
  private readonly audio = new AudioDirector();
  private readonly clock = new THREE.Clock();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 430);
  private readonly hero: HeroVisual = createHeroVisual();
  private readonly playerNormal = new THREE.Vector3();
  private readonly playerHeading = new THREE.Vector3(0, 0, 1);
  private readonly playerPosition = new THREE.Vector3();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly lookAtTarget = new THREE.Vector3();
  private readonly galaxy = new GalaxyBackdrop();
  private readonly trail = new StardustTrail();

  private renderer!: THREE.WebGLRenderer;
  private input: MobileInput | undefined;
  private planets: Planet[] = [];
  private activePlanet!: Planet;
  private phase: GamePhase = 'title';
  private cinematic: LaunchCinematic | undefined;
  private elapsed = 0;
  private playerHeight = 0;
  private verticalVelocity = 0;
  private cameraYaw = 0.2;
  private cameraPitch = 0.34;
  private cameraDistance = 15.5;
  private health = 3;
  private coins = 0;
  private defeatedEnemies = 0;
  private invulnerability = 0;
  private trailCooldown = 0;
  private fps = 60;
  private muted = false;

  private titleScreen!: HTMLElement;
  private hud!: HTMLElement;
  private cinematicOverlay!: HTMLElement;
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
    this.root.innerHTML = this.template();
    const canvas = this.element<HTMLCanvasElement>('.game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setAnimationLoop(this.tick);

    this.titleScreen = this.element('.title-screen');
    this.hud = this.element('.hud');
    this.cinematicOverlay = this.element('.cinematic-overlay');
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
    this.scene.add(this.galaxy.group, this.trail.mesh, this.hero.group);

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
    if (this.phase !== 'title') return;
    this.phase = 'playing';
    this.titleScreen.classList.add('is-hidden');
    this.hud.classList.remove('is-hidden');
    this.audio.start();
    this.input = new MobileInput({ mount: document.body, joystickRadius: 61 });
    this.setStatus('Find bright star tokens, then stand in the launch halo and press JUMP.');
    this.updateUi();
  };

  private readonly tick = (): void => {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += delta;
    this.fps = THREE.MathUtils.lerp(this.fps, 1 / Math.max(delta, 0.001), 0.08);
    this.galaxy.update(delta);
    this.trail.update(delta);
    for (const planet of this.planets) planet.update(delta);

    if (this.phase === 'playing') {
      this.updatePlaying(delta);
    } else if (this.phase === 'cinematic') {
      this.updateCinematic(delta);
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
        this.setStatus('Arc high enough to pounce on a Voidling.');
      } else if (this.activePlanet.isNearLaunch(this.playerNormal) && !this.activePlanet.isLaunchReady) {
        this.setStatus(`Launch halo needs ${this.activePlanet.coinTarget - this.activePlanet.collectedCoins} more star tokens.`);
      }
    }

    const speed = desired.lengthSq() > 0.001 ? 8.4 : 0;
    if (speed > 0) {
      const axis = new THREE.Vector3().crossVectors(this.playerNormal, desired).normalize();
      const distance = speed * delta;
      this.playerNormal.applyAxisAngle(axis, distance / this.activePlanet.definition.radius).normalize();
      this.playerHeading.applyAxisAngle(axis, distance / this.activePlanet.definition.radius).projectOnPlane(this.playerNormal).normalize();
      const targetHeading = desired.clone().projectOnPlane(this.playerNormal).normalize();
      this.playerHeading.lerp(targetHeading, 1 - Math.exp(-13 * delta)).projectOnPlane(this.playerNormal).normalize();
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
    this.cameraYaw -= look.x * 0.006;
    this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch - look.y * 0.004, 0.09, 0.85);
    this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance - this.input.consumeZoomDelta() * 0.023, 8.5, 23);
  }

  private cameraRelativeMovement(x: number, y: number): THREE.Vector3 {
    if (x === 0 && y === 0) return new THREE.Vector3();
    const cameraForward = this.playerHeading.clone().applyAxisAngle(this.playerNormal, this.cameraYaw).projectOnPlane(this.playerNormal).normalize();
    const right = new THREE.Vector3().crossVectors(this.playerNormal, cameraForward).normalize();
    return cameraForward.multiplyScalar(y).addScaledVector(right, x).normalize();
  }

  private updatePlayerVisual(speed: number, airborne: boolean): void {
    this.playerPosition.copy(this.activePlanet.worldPosition(this.playerNormal, 0.08 + this.playerHeight));
    this.hero.group.position.copy(this.playerPosition);
    this.hero.group.quaternion.copy(surfaceOrientation(this.playerNormal, this.playerHeading));
    this.hero.setRunCycle(speed, this.elapsed, airborne);
    this.hero.setHurt(this.invulnerability > 0 && Math.floor(this.elapsed * 18) % 2 === 0);
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
      this.setStatus('Voidling bounced! Keep your momentum and hunt more tokens.');
      return;
    }
    if (this.invulnerability > 0 || this.playerHeight > 0.45) return;
    this.health -= 1;
    this.invulnerability = 1.25;
    this.verticalVelocity = 6.8;
    this.audio.play('hit');
    if (this.health <= 0) {
      this.health = 3;
      this.placePlayerAt(this.activePlanet, this.activePlanet.definition.startNormal);
      this.setStatus('Rescue star restored you to the start beacon.');
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
    this.audio.play('launch');
    this.setStatus(`Slingshotting to ${destination.definition.name}…`);
  }

  private updateCinematic(delta: number): void {
    const cinematic = this.cinematic;
    if (!cinematic) return;
    cinematic.elapsed += delta;
    const duration = 3.25;
    const raw = THREE.MathUtils.clamp(cinematic.elapsed / duration, 0, 1);
    const t = raw * raw * (3 - 2 * raw);
    const middle = cinematic.start.clone().lerp(cinematic.end, 0.5).add(new THREE.Vector3(0, 31, 0));
    const position = quadraticBezier(cinematic.start, middle, cinematic.end, t);
    const future = quadraticBezier(cinematic.start, middle, cinematic.end, Math.min(1, t + 0.02));
    const velocity = future.sub(position).normalize();
    this.hero.group.position.copy(position);
    this.hero.group.quaternion.copy(surfaceOrientation(velocity.clone().cross(WORLD_UP).cross(velocity).normalize(), velocity));
    this.hero.setRunCycle(8, this.elapsed, true);

    const cameraTarget = position.clone().addScaledVector(velocity, 4);
    const cinematicOffset = new THREE.Vector3(10, 7, 15).applyAxisAngle(WORLD_UP, this.elapsed * 0.36);
    this.camera.position.lerp(position.clone().add(cinematicOffset), 1 - Math.exp(-3.8 * delta));
    this.camera.up.copy(WORLD_UP);
    this.camera.lookAt(cameraTarget);

    if (raw < 1) return;
    this.activePlanet = cinematic.destination;
    this.placePlayerAt(this.activePlanet, this.activePlanet.definition.startNormal);
    this.cameraYaw = 0.18;
    this.cameraDistance = 15.5;
    this.cinematic = undefined;
    this.phase = 'playing';
    this.cinematicOverlay.classList.remove('is-active');
    this.setStatus(`${this.activePlanet.definition.name} reached. The next route is all yours.`);
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
    const forward = this.playerHeading.clone().applyAxisAngle(this.playerNormal, this.cameraYaw).projectOnPlane(this.playerNormal).normalize();
    const horizontalDistance = this.cameraDistance * Math.cos(this.cameraPitch);
    const verticalDistance = this.cameraDistance * Math.sin(this.cameraPitch);
    const desired = this.playerPosition.clone()
      .addScaledVector(this.playerNormal, verticalDistance + 1.2)
      .addScaledVector(forward, -horizontalDistance);
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
      loadedAssetIds: ['procedural-hero', 'procedural-planets', 'synth-audio'],
      assetErrors: [],
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
        <section class="title-screen">
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
