import * as THREE from 'three';

export type PlanetId = 'luma' | 'cinder' | 'aurora';

export interface PlanetDefinition {
  id: PlanetId;
  name: string;
  subtitle: string;
  center: THREE.Vector3;
  radius: number;
  primary: number;
  secondary: number;
  atmosphere: number;
  startNormal: THREE.Vector3;
  launchNormal: THREE.Vector3;
  coins: number;
  enemies: number;
}

export interface Coin {
  readonly normal: THREE.Vector3;
  readonly mesh: THREE.Group;
  collected: boolean;
}

export interface Enemy {
  readonly normal: THREE.Vector3;
  readonly mesh: THREE.Group;
  defeated: boolean;
  defeatAge: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

export const PLANET_DEFINITIONS: PlanetDefinition[] = [
  {
    id: 'luma',
    name: 'Luma Garden',
    subtitle: 'A bright first orbit',
    center: new THREE.Vector3(0, 0, 0),
    radius: 13,
    primary: 0x46bd9a,
    secondary: 0xa3e682,
    atmosphere: 0x7fdbff,
    startNormal: normalFromLatitudeLongitude(0.36, 0.18),
    launchNormal: normalFromLatitudeLongitude(0.1, 2.75),
    coins: 22,
    enemies: 5,
  },
  {
    id: 'cinder',
    name: 'Cinder Circuit',
    subtitle: 'A blazing little world',
    center: new THREE.Vector3(42, 11, -25),
    radius: 11,
    primary: 0xc86451,
    secondary: 0xffb15c,
    atmosphere: 0xff7b61,
    startNormal: normalFromLatitudeLongitude(0.48, -1.12),
    launchNormal: normalFromLatitudeLongitude(-0.08, 1.95),
    coins: 24,
    enemies: 6,
  },
  {
    id: 'aurora',
    name: 'Aurora Crown',
    subtitle: 'The final radiant run',
    center: new THREE.Vector3(-32, 20, -48),
    radius: 14,
    primary: 0x635fd4,
    secondary: 0x9b8fff,
    atmosphere: 0xa7f7ff,
    startNormal: normalFromLatitudeLongitude(0.32, 2.2),
    launchNormal: normalFromLatitudeLongitude(-0.22, -0.45),
    coins: 26,
    enemies: 7,
  },
];

export function normalFromLatitudeLongitude(latitude: number, longitude: number): THREE.Vector3 {
  const cosLatitude = Math.cos(latitude);
  return new THREE.Vector3(
    cosLatitude * Math.cos(longitude),
    Math.sin(latitude),
    cosLatitude * Math.sin(longitude),
  );
}

export function surfaceOrientation(normal: THREE.Vector3, forwardHint = FORWARD): THREE.Quaternion {
  const forward = forwardHint.clone().projectOnPlane(normal);
  if (forward.lengthSq() < 0.0001) forward.copy(UP).projectOnPlane(normal);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(normal, forward).normalize();
  const matrix = new THREE.Matrix4().makeBasis(right, normal, forward);
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

function deterministic(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function arcDistance(a: THREE.Vector3, b: THREE.Vector3, radius: number): number {
  return Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) * radius;
}

function colorForSurface(primary: THREE.Color, secondary: THREE.Color, normal: THREE.Vector3, variation: number): THREE.Color {
  const light = THREE.MathUtils.clamp((normal.y + 0.65) * 0.5 + variation * 0.22, 0, 1);
  return primary.clone().lerp(secondary, light * 0.75);
}

function addCrystal(parent: THREE.Group, normal: THREE.Vector3, radius: number, color: THREE.Color, scale: number): void {
  const crystal = new THREE.Mesh(
    new THREE.ConeGeometry(0.38, 1.7, 5),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.45,
      roughness: 0.32,
      metalness: 0.2,
    }),
  );
  crystal.scale.setScalar(scale);
  crystal.position.copy(normal).multiplyScalar(radius + 0.55 * scale);
  crystal.quaternion.copy(surfaceOrientation(normal));
  crystal.rotateX(-Math.PI / 2);
  parent.add(crystal);
}

function addRock(parent: THREE.Group, normal: THREE.Vector3, radius: number, color: THREE.Color, scale: number): void {
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.85, 0),
    new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }),
  );
  rock.position.copy(normal).multiplyScalar(radius + 0.36 * scale);
  rock.quaternion.copy(surfaceOrientation(normal));
  rock.scale.set(scale, scale * 0.65, scale * 0.8);
  parent.add(rock);
}

function createCoin(): THREE.Group {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.11, 8, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffd95b,
      emissive: 0xff9f1a,
      emissiveIntensity: 0.85,
      roughness: 0.26,
      metalness: 0.82,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
  );
  group.add(ring, core);
  return group;
}

function createEnemy(): THREE.Group {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 16, 12),
    new THREE.MeshStandardMaterial({
      color: 0x4b315e,
      emissive: 0x24123a,
      emissiveIntensity: 0.7,
      roughness: 0.38,
      metalness: 0.35,
    }),
  );
  shell.scale.set(1, 0.76, 1);
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.43, 12, 8),
    new THREE.MeshStandardMaterial({
      color: 0x18213f,
      emissive: 0x75eaff,
      emissiveIntensity: 1.6,
      roughness: 0.15,
      metalness: 0.7,
    }),
  );
  visor.position.set(0, 0.12, 0.48);
  visor.scale.set(1.05, 0.52, 0.34);
  const antenna = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.45, 6),
    new THREE.MeshStandardMaterial({ color: 0xff668c, emissive: 0xff335f, emissiveIntensity: 1 }),
  );
  antenna.position.y = 0.76;
  group.add(shell, visor, antenna);
  return group;
}

function createLaunchPad(color: number): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.25,
    roughness: 0.18,
    metalness: 0.6,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.09, 8, 32), material);
  ring.rotation.x = Math.PI / 2;
  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(1.08, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide }),
  );
  inner.rotation.x = -Math.PI / 2;
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 2.6, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38 }),
  );
  beacon.position.y = 1.15;
  group.add(ring, inner, beacon);
  return group;
}

function createCloudMaterial(color: number): THREE.SpriteMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(48, 48, 4, 48, 48, 48);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.32, '#dcefff');
    gradient.addColorStop(1, 'rgba(220,239,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 96, 96);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export class Planet {
  readonly group = new THREE.Group();
  readonly coins: Coin[] = [];
  readonly enemies: Enemy[] = [];
  readonly launchPad: THREE.Group;
  readonly coinTarget: number;

  private readonly launchMaterial: THREE.MeshStandardMaterial;
  private elapsed = 0;

  constructor(readonly definition: PlanetDefinition) {
    this.group.name = definition.name;
    this.group.position.copy(definition.center);
    this.coinTarget = Math.ceil(definition.coins * 0.58);
    this.launchMaterial = new THREE.MeshStandardMaterial({
      color: definition.atmosphere,
      emissive: definition.atmosphere,
      emissiveIntensity: 0.5,
      roughness: 0.18,
      metalness: 0.6,
    });
    this.createSurface();
    this.createDecorations();
    this.createCollectibles();
    this.createEnemies();
    this.launchPad = this.createLaunchPad();
    this.group.add(this.launchPad);
  }

  get collectedCoins(): number {
    return this.coins.filter((coin) => coin.collected).length;
  }

  get isLaunchReady(): boolean {
    return this.collectedCoins >= this.coinTarget;
  }

  worldPosition(normal: THREE.Vector3, height = 0): THREE.Vector3 {
    return normal.clone().multiplyScalar(this.definition.radius + height).add(this.definition.center);
  }

  collectNear(normal: THREE.Vector3, threshold = 1.15): Coin | undefined {
    const coin = this.coins.find((candidate) => !candidate.collected && arcDistance(candidate.normal, normal, this.definition.radius) < threshold);
    if (!coin) return undefined;
    coin.collected = true;
    coin.mesh.visible = false;
    return coin;
  }

  enemyNear(normal: THREE.Vector3, threshold = 1.36): Enemy | undefined {
    return this.enemies.find((candidate) => !candidate.defeated && arcDistance(candidate.normal, normal, this.definition.radius) < threshold);
  }

  isNearLaunch(normal: THREE.Vector3): boolean {
    return arcDistance(this.definition.launchNormal, normal, this.definition.radius) < 2.1;
  }

  update(delta: number): void {
    this.elapsed += delta;
    for (const coin of this.coins) {
      if (coin.collected) continue;
      coin.mesh.rotation.y += delta * 3.2;
      const pulse = 1 + Math.sin(this.elapsed * 5 + coin.normal.x * 8) * 0.1;
      coin.mesh.scale.setScalar(pulse);
    }
    for (const enemy of this.enemies) {
      if (enemy.defeated) {
        enemy.defeatAge += delta;
        const scale = Math.max(0, 1 - enemy.defeatAge * 2.7);
        enemy.mesh.scale.setScalar(scale);
        continue;
      }
      const bob = 0.16 + Math.sin(this.elapsed * 3.2 + enemy.normal.z * 11) * 0.11;
      enemy.mesh.position.copy(enemy.normal).multiplyScalar(this.definition.radius + 0.7 + bob);
      enemy.mesh.rotateY(delta * 0.8);
    }
    const launchPulse = this.isLaunchReady ? 1.35 + Math.sin(this.elapsed * 5) * 0.45 : 0.38;
    this.launchMaterial.emissiveIntensity = launchPulse;
    this.launchPad.rotation.y += delta * (this.isLaunchReady ? 0.9 : 0.22);
  }

  private createSurface(): void {
    const geometry = new THREE.IcosahedronGeometry(this.definition.radius, 5);
    const position = geometry.getAttribute('position');
    const colors = new Float32Array(position.count * 3);
    const primary = new THREE.Color(this.definition.primary);
    const secondary = new THREE.Color(this.definition.secondary);
    const normal = new THREE.Vector3();
    const color = new THREE.Color();
    for (let index = 0; index < position.count; index += 1) {
      normal.fromBufferAttribute(position, index).normalize();
      const variation = Math.sin(normal.x * 19 + normal.y * 13 + normal.z * 17) * 0.5 + 0.5;
      color.copy(colorForSurface(primary, secondary, normal, variation));
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const surface = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0.04,
        flatShading: false,
      }),
    );
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(this.definition.radius + 0.38, 32, 20),
      new THREE.MeshBasicMaterial({
        color: this.definition.atmosphere,
        transparent: true,
        opacity: 0.085,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.group.add(surface, atmosphere);
  }

  private createDecorations(): void {
    const primary = new THREE.Color(this.definition.primary);
    const secondary = new THREE.Color(this.definition.secondary);
    const noBuildZones = [this.definition.startNormal, this.definition.launchNormal];
    for (let index = 0; index < 42; index += 1) {
      const normal = normalFromLatitudeLongitude(
        -0.92 + deterministic(index * 5 + this.definition.radius) * 1.84,
        deterministic(index * 7 + this.definition.center.x) * Math.PI * 2,
      );
      if (noBuildZones.some((zone) => arcDistance(zone, normal, this.definition.radius) < 2.5)) continue;
      const scale = 0.45 + deterministic(index * 13) * 0.85;
      if (index % 3 === 0) {
        addCrystal(this.group, normal, this.definition.radius, primary.clone().lerp(secondary, deterministic(index * 17)), scale);
      } else {
        addRock(this.group, normal, this.definition.radius, primary.clone().multiplyScalar(0.5 + deterministic(index) * 0.4), scale);
      }
    }

    const cloudMaterial = createCloudMaterial(this.definition.atmosphere);
    for (let index = 0; index < 9; index += 1) {
      const normal = normalFromLatitudeLongitude(
        -0.45 + deterministic(index * 19 + this.definition.radius) * 0.9,
        deterministic(index * 23 + this.definition.center.z) * Math.PI * 2,
      );
      const cloud = new THREE.Sprite(cloudMaterial);
      cloud.position.copy(normal).multiplyScalar(this.definition.radius + 0.7);
      cloud.scale.setScalar(2.7 + deterministic(index * 29) * 2.5);
      this.group.add(cloud);
    }
  }

  private createCollectibles(): void {
    for (let index = 0; index < this.definition.coins; index += 1) {
      let normal = normalFromLatitudeLongitude(
        -0.85 + deterministic(index * 31 + this.definition.radius) * 1.7,
        deterministic(index * 37 + this.definition.center.y) * Math.PI * 2,
      );
      if (arcDistance(normal, this.definition.startNormal, this.definition.radius) < 2.1) {
        normal = normalFromLatitudeLongitude(normal.y * 0.5, Math.atan2(normal.z, normal.x) + 0.62);
      }
      const mesh = createCoin();
      mesh.position.copy(normal).multiplyScalar(this.definition.radius + 0.72);
      mesh.quaternion.copy(surfaceOrientation(normal));
      this.coins.push({ normal, mesh, collected: false });
      this.group.add(mesh);
    }
  }

  private createEnemies(): void {
    for (let index = 0; index < this.definition.enemies; index += 1) {
      const normal = normalFromLatitudeLongitude(
        -0.66 + deterministic(index * 43 + this.definition.center.x) * 1.32,
        deterministic(index * 47 + this.definition.radius) * Math.PI * 2,
      );
      const mesh = createEnemy();
      mesh.position.copy(normal).multiplyScalar(this.definition.radius + 0.85);
      mesh.quaternion.copy(surfaceOrientation(normal));
      this.enemies.push({ normal, mesh, defeated: false, defeatAge: 0 });
      this.group.add(mesh);
    }
  }

  private createLaunchPad(): THREE.Group {
    const launchPad = createLaunchPad(this.definition.atmosphere);
    launchPad.position.copy(this.definition.launchNormal).multiplyScalar(this.definition.radius + 0.24);
    launchPad.quaternion.copy(surfaceOrientation(this.definition.launchNormal));
    return launchPad;
  }
}

export interface HeroVisual {
  readonly group: THREE.Group;
  setRunCycle(speed: number, elapsed: number, airborne: boolean): void;
  setHurt(active: boolean): void;
}

export function createHeroVisual(): HeroVisual {
  const group = new THREE.Group();
  group.name = 'Nova, the Star Runner';
  const suit = new THREE.MeshStandardMaterial({
    color: 0xeff8ff,
    roughness: 0.28,
    metalness: 0.65,
  });
  const suitAccent = new THREE.MeshStandardMaterial({
    color: 0x1678e8,
    emissive: 0x0755b4,
    emissiveIntensity: 0.8,
    roughness: 0.22,
    metalness: 0.5,
  });
  const visor = new THREE.MeshStandardMaterial({
    color: 0x16204b,
    emissive: 0x68ecff,
    emissiveIntensity: 1.7,
    roughness: 0.08,
    metalness: 0.8,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 0.86, 6, 12), suit);
  body.position.y = 1.1;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.66, 20, 14), suit);
  helmet.position.y = 1.95;
  const visorMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), visor);
  visorMesh.position.set(0, 1.98, 0.38);
  visorMesh.scale.set(1, 0.54, 0.3);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.78, 0.26), suitAccent);
  pack.position.set(0, 1.2, -0.52);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), visor);
  core.position.set(0, 1.18, 0.53);
  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  const limbGeometry = new THREE.CapsuleGeometry(0.17, 0.46, 4, 8);
  const bootGeometry = new THREE.SphereGeometry(0.27, 12, 8);
  for (const [limb, x, y, z, isArm] of [
    [leftLeg, -0.29, 0.42, 0, false],
    [rightLeg, 0.29, 0.42, 0, false],
    [leftArm, -0.69, 1.36, 0, true],
    [rightArm, 0.69, 1.36, 0, true],
  ] as const) {
    const joint = new THREE.Mesh(limbGeometry, suitAccent);
    joint.position.y = isArm ? -0.24 : -0.3;
    limb.add(joint);
    if (!isArm) {
      const boot = new THREE.Mesh(bootGeometry, suit);
      boot.position.set(0, -0.68, 0.08);
      limb.add(boot);
    }
    limb.position.set(x, y, z);
    group.add(limb);
  }
  group.add(body, helmet, visorMesh, pack, core);

  return {
    group,
    setRunCycle(speed: number, elapsed: number, airborne: boolean): void {
      const amount = Math.min(1, speed / 8);
      const swing = Math.sin(elapsed * (airborne ? 5 : 14)) * 0.75 * amount;
      leftLeg.rotation.x = airborne ? -0.45 : swing;
      rightLeg.rotation.x = airborne ? 0.45 : -swing;
      leftArm.rotation.x = airborne ? 0.55 : -swing * 0.8;
      rightArm.rotation.x = airborne ? -0.55 : swing * 0.8;
      body.position.y = 1.1 + (airborne ? 0.03 : Math.abs(swing) * 0.05);
    },
    setHurt(active: boolean): void {
      visor.emissiveIntensity = active ? 0.35 : 1.7;
      suitAccent.emissiveIntensity = active ? 2.2 : 0.8;
    },
  };
}

export class GalaxyBackdrop {
  readonly group = new THREE.Group();

  constructor() {
    const positions = new Float32Array(1650 * 3);
    const colors = new Float32Array(1650 * 3);
    const color = new THREE.Color();
    for (let index = 0; index < 1650; index += 1) {
      const theta = deterministic(index * 5) * Math.PI * 2;
      const phi = Math.acos(2 * deterministic(index * 7) - 1);
      const radius = 115 + deterministic(index * 11) * 115;
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.cos(phi);
      positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      color.setHSL(0.52 + deterministic(index * 17) * 0.25, 0.62, 0.65 + deterministic(index * 19) * 0.28);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    const stars = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.7,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      }),
    );
    this.group.add(stars);

    const nebulaMaterial = createCloudMaterial(0x9674ff);
    for (let index = 0; index < 6; index += 1) {
      const sprite = new THREE.Sprite(nebulaMaterial);
      sprite.position.set(
        -70 + deterministic(index * 37) * 145,
        -35 + deterministic(index * 41) * 95,
        -105 + deterministic(index * 43) * 68,
      );
      sprite.scale.setScalar(36 + deterministic(index * 47) * 32);
      this.group.add(sprite);
    }
  }

  update(delta: number): void {
    this.group.rotation.y += delta * 0.003;
  }
}
