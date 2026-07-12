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
  bossNormal?: THREE.Vector3;
  bossHealth?: number;
  relicRingTarget?: number;
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

export interface PlanetBoss {
  readonly normal: THREE.Vector3;
  readonly mesh: THREE.Group;
  readonly maxHealth: number;
  health: number;
  defeated: boolean;
  defeatAge: number;
}

export interface PlanetRelic {
  readonly normal: THREE.Vector3;
  readonly mesh: THREE.Group;
  collected: boolean;
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
    radius: 18,
    primary: 0x635fd4,
    secondary: 0x9b8fff,
    atmosphere: 0xa7f7ff,
    startNormal: normalFromLatitudeLongitude(0.32, 2.2),
    launchNormal: normalFromLatitudeLongitude(-0.22, -0.45),
    coins: 36,
    enemies: 9,
    bossNormal: normalFromLatitudeLongitude(0.16, -1.18),
    bossHealth: 5,
    relicRingTarget: 23,
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

function surfaceNormalQuaternion(normal: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(FORWARD, normal);
}

function createOrbitRing(
  radius: number,
  tube: number,
  color: number,
  emissive: number,
  opacity = 1,
): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.8,
    roughness: 0.3,
    metalness: 0.45,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 72), material);
  ring.rotation.x = Math.PI / 2;
  return ring;
}

function createLatitudeBand(
  radius: number,
  latitude: number,
  color: number,
  emissive: number,
  opacity = 1,
): THREE.Mesh {
  const bandRadius = Math.max(0.5, radius * Math.cos(latitude));
  const band = createOrbitRing(bandRadius, 0.055, color, emissive, opacity);
  band.position.y = radius * Math.sin(latitude);
  return band;
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

function createBoss(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Aurora Crown Warden';

  const armor = new THREE.MeshStandardMaterial({
    color: 0x31256f,
    emissive: 0x21104f,
    emissiveIntensity: 1.05,
    roughness: 0.3,
    metalness: 0.7,
  });
  const armorHighlight = new THREE.MeshStandardMaterial({
    color: 0x9e82ff,
    emissive: 0x5c45ff,
    emissiveIntensity: 1.4,
    roughness: 0.2,
    metalness: 0.55,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd7f6,
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
  });

  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1.42, 1), armor);
  body.scale.set(1, 1.28, 0.9);
  body.position.y = 1.55;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 10), coreMaterial);
  core.position.set(0, 1.62, 0.92);
  const visorGeometry = new THREE.BoxGeometry(0.86, 0.2, 0.12);
  const visorFront = new THREE.Mesh(visorGeometry, coreMaterial);
  visorFront.position.set(0, 2.05, 1.08);
  const visorBack = new THREE.Mesh(visorGeometry, coreMaterial);
  visorBack.position.set(0, 2.05, -1.08);
  const crown = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.13, 8, 32), armorHighlight);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 2.78;
  const shoulderLeft = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.35, 6), armorHighlight);
  shoulderLeft.position.set(-1.15, 1.58, 0);
  shoulderLeft.rotation.z = -0.62;
  const shoulderRight = shoulderLeft.clone();
  shoulderRight.position.x = 1.15;
  shoulderRight.rotation.z = 0.62;
  const hornLeft = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 5), armor);
  hornLeft.position.set(-0.62, 2.85, 0);
  hornLeft.rotation.z = -0.42;
  const hornRight = hornLeft.clone();
  hornRight.position.x = 0.62;
  hornRight.rotation.z = 0.42;
  const aura = new THREE.Mesh(
    new THREE.TorusGeometry(1.95, 0.055, 8, 48),
    new THREE.MeshBasicMaterial({
      color: 0x8defff,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  aura.rotation.x = Math.PI / 2;
  aura.position.y = 1.35;
  aura.name = 'boss-aura';
  group.add(body, core, visorFront, visorBack, crown, shoulderLeft, shoulderRight, hornLeft, hornRight, aura);
  return group;
}

function createBossArena(color: number): THREE.Group {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.75, 0.075, 8, 48),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.55,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(2.68, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.11, side: THREE.DoubleSide }),
  );
  inner.rotation.x = -Math.PI / 2;
  const pillarGeometry = new THREE.CylinderGeometry(0.06, 0.12, 1.65, 6);
  const pillarMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.48 });
  for (let index = 0; index < 4; index += 1) {
    const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
    const angle = index * Math.PI / 2 + Math.PI / 4;
    pillar.position.set(Math.cos(angle) * 2.2, 0.72, Math.sin(angle) * 2.2);
    group.add(pillar);
  }
  group.add(ring, inner);
  return group;
}

function createRelic(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Aurora Crown relic';
  const crownMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe2a0,
    emissive: 0xff9dff,
    emissiveIntensity: 1.7,
    roughness: 0.16,
    metalness: 0.68,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xc5f8ff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
  });
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.13, 8, 28), crownMaterial);
  crown.rotation.x = Math.PI / 2;
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 1), coreMaterial);
  core.position.y = 0.18;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.22, 1.8, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x8defff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending }),
  );
  beam.position.y = 0.9;
  group.add(crown, core, beam);
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

function createLumaLandmarks(parent: THREE.Group, radius: number): void {
  const gardenRing = createOrbitRing(radius + 0.08, 0.09, 0x77f6c6, 0x1dba9d, 0.9);
  gardenRing.rotation.z = 0.2;
  parent.add(gardenRing);

  const stemGeometry = new THREE.CylinderGeometry(0.08, 0.14, 1.18, 6);
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f9c76,
    roughness: 0.72,
    metalness: 0.08,
  });
  const petalGeometry = new THREE.ConeGeometry(0.28, 0.68, 5);
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: 0xc2ffe2,
    emissive: 0x55ffd0,
    emissiveIntensity: 1.1,
    roughness: 0.28,
    metalness: 0.12,
  });
  const normals = [
    normalFromLatitudeLongitude(0.36, -1.7),
    normalFromLatitudeLongitude(0.18, -0.7),
    normalFromLatitudeLongitude(-0.06, 0.15),
    normalFromLatitudeLongitude(-0.24, 1.05),
    normalFromLatitudeLongitude(0.44, 2.05),
    normalFromLatitudeLongitude(-0.4, 2.72),
    normalFromLatitudeLongitude(0.08, -2.55),
    normalFromLatitudeLongitude(-0.15, -2.0),
  ];
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, normals.length);
  const petals = new THREE.InstancedMesh(petalGeometry, petalMaterial, normals.length);
  const dummy = new THREE.Object3D();
  normals.forEach((normal, index) => {
    const scale = 0.62 + deterministic(index * 23 + radius) * 0.48;
    dummy.position.copy(normal).multiplyScalar(radius + 0.62 * scale);
    dummy.quaternion.copy(surfaceOrientation(normal));
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    stems.setMatrixAt(index, dummy.matrix);

    dummy.position.copy(normal).multiplyScalar(radius + 1.27 * scale);
    dummy.scale.setScalar(scale * 0.88);
    dummy.updateMatrix();
    petals.setMatrixAt(index, dummy.matrix);
  });
  stems.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  petals.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  stems.computeBoundingSphere();
  petals.computeBoundingSphere();
  parent.add(stems, petals);
}

function createCinderLandmarks(parent: THREE.Group, radius: number): void {
  const circuitRing = createOrbitRing(radius + 0.12, 0.1, 0xff8c4b, 0xb72e1d, 0.92);
  circuitRing.rotation.z = -0.26;
  parent.add(circuitRing);
  parent.add(createLatitudeBand(radius + 0.04, 0.34, 0xffd17a, 0xff4d27, 0.42));

  const craterNormals = [
    normalFromLatitudeLongitude(0.48, -0.72),
    normalFromLatitudeLongitude(0.14, 0.62),
    normalFromLatitudeLongitude(-0.2, 2.25),
    normalFromLatitudeLongitude(-0.48, -2.32),
    normalFromLatitudeLongitude(0.02, -2.55),
  ];
  const rimGeometry = new THREE.TorusGeometry(1, 0.13, 6, 28);
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: 0x492530,
    emissive: 0x4d1e23,
    emissiveIntensity: 0.8,
    roughness: 0.92,
    metalness: 0.12,
  });
  const floorGeometry = new THREE.CircleGeometry(0.88, 24);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x25152a,
    emissive: 0x7d291d,
    emissiveIntensity: 0.9,
    roughness: 0.8,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  const rims = new THREE.InstancedMesh(rimGeometry, rimMaterial, craterNormals.length);
  const floors = new THREE.InstancedMesh(floorGeometry, floorMaterial, craterNormals.length);
  const dummy = new THREE.Object3D();
  craterNormals.forEach((normal, index) => {
    const scale = 0.72 + deterministic(index * 29 + radius) * 0.7;
    dummy.position.copy(normal).multiplyScalar(radius + 0.08);
    dummy.quaternion.copy(surfaceNormalQuaternion(normal));
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    rims.setMatrixAt(index, dummy.matrix);
    dummy.position.copy(normal).multiplyScalar(radius + 0.06);
    dummy.scale.setScalar(scale * 0.9);
    dummy.updateMatrix();
    floors.setMatrixAt(index, dummy.matrix);
  });
  rims.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  floors.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  rims.computeBoundingSphere();
  floors.computeBoundingSphere();
  parent.add(rims, floors);

  const ventGeometry = new THREE.ConeGeometry(0.12, 0.8, 5);
  const ventMaterial = new THREE.MeshStandardMaterial({
    color: 0xffa45e,
    emissive: 0xff3d1d,
    emissiveIntensity: 1.5,
    roughness: 0.34,
    metalness: 0.35,
  });
  const vents = new THREE.InstancedMesh(ventGeometry, ventMaterial, 7);
  for (let index = 0; index < 7; index += 1) {
    const normal = normalFromLatitudeLongitude(
      -0.3 + deterministic(index * 67 + radius) * 0.9,
      deterministic(index * 71 + radius) * Math.PI * 2,
    );
    dummy.position.copy(normal).multiplyScalar(radius + 0.55);
    dummy.quaternion.copy(surfaceOrientation(normal));
    dummy.scale.setScalar(0.6 + deterministic(index * 73) * 0.45);
    dummy.updateMatrix();
    vents.setMatrixAt(index, dummy.matrix);
  }
  vents.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  vents.computeBoundingSphere();
  parent.add(vents);
}

function createAuroraLandmarks(parent: THREE.Group, radius: number): void {
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(radius + 0.12, 24, 12, 0, Math.PI * 2, 0, 0.52),
    new THREE.MeshStandardMaterial({
      color: 0xe3fcff,
      emissive: 0x6ed9ff,
      emissiveIntensity: 0.75,
      roughness: 0.38,
      metalness: 0.2,
      transparent: true,
      opacity: 0.78,
    }),
  );
  parent.add(cap);
  parent.add(createLatitudeBand(radius + 0.1, 0.28, 0x7ef5ff, 0x34d9ff, 0.65));
  parent.add(createLatitudeBand(radius + 0.1, 0.46, 0xb1a4ff, 0x725dff, 0.48));
  parent.add(createLatitudeBand(radius + 0.1, -0.34, 0x7ef5ff, 0x34d9ff, 0.42));

  const auroraRing = createOrbitRing(radius + 0.3, 0.065, 0x8defff, 0x3d76ff, 0.75);
  auroraRing.rotation.z = 0.36;
  parent.add(auroraRing);

  const shardGeometry = new THREE.ConeGeometry(0.2, 1.45, 5);
  const shardMaterial = new THREE.MeshStandardMaterial({
    color: 0xd2ccff,
    emissive: 0x665eff,
    emissiveIntensity: 0.95,
    roughness: 0.25,
    metalness: 0.42,
  });
  const shardNormals = [
    normalFromLatitudeLongitude(0.58, -1.6),
    normalFromLatitudeLongitude(0.4, -0.2),
    normalFromLatitudeLongitude(0.18, 1.05),
    normalFromLatitudeLongitude(-0.05, 2.0),
    normalFromLatitudeLongitude(-0.34, 2.8),
    normalFromLatitudeLongitude(-0.55, -2.4),
    normalFromLatitudeLongitude(0.02, -2.6),
    normalFromLatitudeLongitude(0.26, -2.1),
  ];
  const shards = new THREE.InstancedMesh(shardGeometry, shardMaterial, shardNormals.length);
  const dummy = new THREE.Object3D();
  shardNormals.forEach((normal, index) => {
    const scale = 0.62 + deterministic(index * 83 + radius) * 0.55;
    dummy.position.copy(normal).multiplyScalar(radius + 0.64 * scale);
    dummy.quaternion.copy(surfaceOrientation(normal));
    dummy.scale.set(scale, scale * 1.28, scale);
    dummy.updateMatrix();
    shards.setMatrixAt(index, dummy.matrix);
  });
  shards.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  shards.computeBoundingSphere();
  parent.add(shards);
}

function createSurfaceLandmarks(parent: THREE.Group, definition: PlanetDefinition): void {
  if (definition.id === 'luma') createLumaLandmarks(parent, definition.radius);
  if (definition.id === 'cinder') createCinderLandmarks(parent, definition.radius);
  if (definition.id === 'aurora') createAuroraLandmarks(parent, definition.radius);
}

export class Planet {
  readonly group = new THREE.Group();
  readonly coins: Coin[] = [];
  readonly enemies: Enemy[] = [];
  readonly boss?: PlanetBoss;
  readonly relic?: PlanetRelic;
  readonly launchPad: THREE.Group;
  readonly coinTarget: number;
  readonly relicRingTarget: number;

  private readonly launchMaterial: THREE.MeshStandardMaterial;
  private elapsed = 0;

  constructor(readonly definition: PlanetDefinition) {
    this.group.name = definition.name;
    this.group.position.copy(definition.center);
    this.coinTarget = Math.ceil(definition.coins * 0.58);
    this.relicRingTarget = Math.min(definition.coins, definition.relicRingTarget ?? this.coinTarget);
    this.launchMaterial = new THREE.MeshStandardMaterial({
      color: definition.atmosphere,
      emissive: definition.atmosphere,
      emissiveIntensity: 0.5,
      roughness: 0.18,
      metalness: 0.6,
    });
    this.createSurface();
    createSurfaceLandmarks(this.group, definition);
    this.createDecorations();
    this.createCollectibles();
    this.createEnemies();
    if (definition.bossNormal) {
      const bossMesh = createBoss();
      bossMesh.position.copy(definition.bossNormal).multiplyScalar(definition.radius + 0.58);
      bossMesh.quaternion.copy(surfaceOrientation(definition.bossNormal));
      this.boss = {
        normal: definition.bossNormal.clone(),
        mesh: bossMesh,
        maxHealth: definition.bossHealth ?? 5,
        health: definition.bossHealth ?? 5,
        defeated: false,
        defeatAge: 0,
      };
      const arena = createBossArena(definition.atmosphere);
      arena.position.copy(definition.bossNormal).multiplyScalar(definition.radius + 0.14);
      arena.quaternion.copy(surfaceOrientation(definition.bossNormal));
      arena.name = 'boss arena';
      this.group.add(arena, bossMesh);

      const relicMesh = createRelic();
      relicMesh.visible = false;
      relicMesh.position.copy(definition.bossNormal).multiplyScalar(definition.radius + 1.1);
      relicMesh.quaternion.copy(surfaceOrientation(definition.bossNormal));
      this.relic = { normal: definition.bossNormal.clone(), mesh: relicMesh, collected: false };
      this.group.add(relicMesh);
    }
    this.launchPad = this.createLaunchPad();
    this.group.add(this.launchPad);
  }

  get collectedCoins(): number {
    return this.coins.filter((coin) => coin.collected).length;
  }

  get isLaunchReady(): boolean {
    return this.isBossPlanet ? this.relicCollected : this.collectedCoins >= this.coinTarget;
  }

  get isBossPlanet(): boolean {
    return this.boss !== undefined;
  }

  get isBossDefeated(): boolean {
    return this.boss?.defeated ?? false;
  }

  get isRelicReady(): boolean {
    return this.relic !== undefined
      && !this.relic.collected
      && (this.isBossDefeated || this.collectedCoins >= this.relicRingTarget);
  }

  get relicCollected(): boolean {
    return this.relic?.collected ?? false;
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

  bossNear(normal: THREE.Vector3, threshold = 2.45): PlanetBoss | undefined {
    if (!this.boss || this.boss.defeated) return undefined;
    return arcDistance(this.boss.normal, normal, this.definition.radius) < threshold ? this.boss : undefined;
  }

  damageBoss(amount = 1): boolean {
    if (!this.boss || this.boss.defeated) return false;
    this.boss.health = Math.max(0, this.boss.health - amount);
    if (this.boss.health > 0) return false;
    this.boss.defeated = true;
    this.boss.defeatAge = 0;
    return true;
  }

  collectRelicNear(normal: THREE.Vector3, threshold = 1.8): PlanetRelic | undefined {
    if (!this.relic || !this.isRelicReady) return undefined;
    if (arcDistance(this.relic.normal, normal, this.definition.radius) >= threshold) return undefined;
    this.relic.collected = true;
    this.relic.mesh.visible = false;
    return this.relic;
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
    if (this.boss) {
      if (this.boss.defeated) {
        this.boss.defeatAge += delta;
        const collapse = Math.max(0, 1 - this.boss.defeatAge * 1.35);
        this.boss.mesh.scale.setScalar(collapse);
        this.boss.mesh.rotation.y += delta * 2.4;
      } else {
        const bob = Math.sin(this.elapsed * 2.4) * 0.18;
        this.boss.mesh.position.copy(this.boss.normal).multiplyScalar(this.definition.radius + 0.58 + bob);
        this.boss.mesh.rotateY(delta * 0.45);
        const aura = this.boss.mesh.getObjectByName('boss-aura');
        if (aura) aura.rotation.z += delta * 1.8;
      }
    }
    if (this.relic) {
      this.relic.mesh.visible = this.isRelicReady;
      if (this.relic.mesh.visible) {
        this.relic.mesh.rotation.y += delta * 1.8;
        const pulse = 1 + Math.sin(this.elapsed * 5.5) * 0.1;
        this.relic.mesh.scale.setScalar(pulse);
      }
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
    if (this.definition.bossNormal) noBuildZones.push(this.definition.bossNormal);
    const rockPlacements: Array<{ normal: THREE.Vector3; scale: number }> = [];
    const crystalPlacements: Array<{ normal: THREE.Vector3; scale: number }> = [];
    for (let index = 0; index < 34; index += 1) {
      const normal = normalFromLatitudeLongitude(
        -0.92 + deterministic(index * 5 + this.definition.radius) * 1.84,
        deterministic(index * 7 + this.definition.center.x) * Math.PI * 2,
      );
      if (noBuildZones.some((zone) => arcDistance(zone, normal, this.definition.radius) < 2.5)) continue;
      const scale = 0.45 + deterministic(index * 13) * 0.85;
      if (index % 3 === 0) {
        crystalPlacements.push({ normal, scale });
      } else {
        rockPlacements.push({ normal, scale });
      }
    }

    const dummy = new THREE.Object3D();
    const rockMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.85, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }),
      rockPlacements.length,
    );
    rockPlacements.forEach(({ normal, scale }, index) => {
      dummy.position.copy(normal).multiplyScalar(this.definition.radius + 0.36 * scale);
      dummy.quaternion.copy(surfaceOrientation(normal));
      dummy.scale.set(scale, scale * 0.65, scale * 0.8);
      dummy.updateMatrix();
      rockMesh.setMatrixAt(index, dummy.matrix);
      rockMesh.setColorAt(index, primary.clone().multiplyScalar(0.5 + deterministic(index) * 0.4));
    });
    rockMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    rockMesh.instanceColor?.setUsage(THREE.StaticDrawUsage);
    rockMesh.computeBoundingSphere();

    const crystalMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.38, 1.7, 5),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.45,
        roughness: 0.32,
        metalness: 0.2,
      }),
      crystalPlacements.length,
    );
    crystalPlacements.forEach(({ normal, scale }, index) => {
      dummy.position.copy(normal).multiplyScalar(this.definition.radius + 0.55 * scale);
      dummy.quaternion.copy(surfaceOrientation(normal));
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      crystalMesh.setMatrixAt(index, dummy.matrix);
      crystalMesh.setColorAt(index, primary.clone().lerp(secondary, deterministic(index * 17)));
    });
    crystalMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    crystalMesh.instanceColor?.setUsage(THREE.StaticDrawUsage);
    crystalMesh.computeBoundingSphere();
    this.group.add(rockMesh, crystalMesh);

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
      if (this.definition.bossNormal && arcDistance(normal, this.definition.bossNormal, this.definition.radius) < 3.2) {
        normal = normalFromLatitudeLongitude(normal.y * 0.5, Math.atan2(normal.z, normal.x) + 0.82);
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
      let normal = normalFromLatitudeLongitude(
        -0.66 + deterministic(index * 43 + this.definition.center.x) * 1.32,
        deterministic(index * 47 + this.definition.radius) * Math.PI * 2,
      );
      if (this.definition.bossNormal && arcDistance(normal, this.definition.bossNormal, this.definition.radius) < 3.6) {
        normal = normalFromLatitudeLongitude(normal.y * 0.5, Math.atan2(normal.z, normal.x) + 0.9);
      }
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

export type HeroWeaponAnimation = 'equip' | 'attack';

interface WeaponPose {
  readonly object: THREE.Object3D;
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly scale: THREE.Vector3;
  readonly equipPosition: THREE.Vector3;
  readonly equipQuaternion: THREE.Quaternion;
  readonly equipScale: THREE.Vector3;
}

const HERO_WEAPON_LOADOUT = new Set(['1H_Crossbow', 'Knife_Offhand']);
const HERO_HIDDEN_WEAPONS = new Set(['2H_Crossbow', 'Knife', 'Throwable']);

export interface HeroVisual {
  readonly group: THREE.Group;
  attachModel(model: THREE.Object3D): void;
  showFallback(): void;
  setRunCycle(speed: number, elapsed: number, airborne: boolean): void;
  setHurt(active: boolean): void;
  triggerWeaponAnimation(animation: HeroWeaponAnimation, elapsed: number): void;
}

export function createHeroVisual(): HeroVisual {
  const group = new THREE.Group();
  group.name = 'Nova, the Star Runner';
  const fallback = new THREE.Group();
  fallback.name = 'procedural player fallback';
  // Keep the placeholder out of sight while the authored character is loading.
  // It is revealed only if the shipped model cannot be loaded.
  fallback.visible = false;
  group.add(fallback);
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
    fallback.add(limb);
  }
  fallback.add(body, helmet, visorMesh, pack, core);

  // The source rogue ships every hand-slot prop in the same scene. Keep a
  // readable two-piece loadout (crossbow + offhand knife), and animate those
  // props independently so equip/attack beats remain visible even when the
  // authored arm clips are cross-faded.
  let weaponPoses: WeaponPose[] = [];
  let weaponAnimation: { kind: HeroWeaponAnimation; start: number; duration: number } | undefined;
  const weaponEquipOffset = new THREE.Vector3(0, 0.14, -0.05);
  const weaponRecoil = new THREE.Quaternion();
  const weaponRecoilAxis = new THREE.Vector3(0, 1, 0);

  const updateWeaponAnimation = (elapsed: number): void => {
    if (!weaponAnimation) return;
    const progress = THREE.MathUtils.clamp((elapsed - weaponAnimation.start) / weaponAnimation.duration, 0, 1);
    if (weaponAnimation.kind === 'equip') {
      const eased = 1 - Math.pow(1 - progress, 3);
      for (const pose of weaponPoses) {
        pose.object.position.lerpVectors(pose.equipPosition, pose.position, eased);
        pose.object.quaternion.copy(pose.equipQuaternion).slerp(pose.quaternion, eased);
        pose.object.scale.lerpVectors(pose.equipScale, pose.scale, eased);
      }
    } else {
      // The 1H attack clip drives the arms. This secondary hand-local recoil
      // gives both retained weapons a readable impact without changing the
      // source GLB or introducing another weapon mesh.
      const pulse = Math.sin(progress * Math.PI);
      for (const pose of weaponPoses) {
        pose.object.position.copy(pose.position);
        pose.object.position.z -= pulse * 0.075;
        pose.object.position.x += (pose.object.name === 'Knife_Offhand' ? -1 : 1) * pulse * 0.035;
        weaponRecoil.setFromAxisAngle(weaponRecoilAxis, pulse * 0.24);
        pose.object.quaternion.copy(pose.quaternion).multiply(weaponRecoil);
        pose.object.scale.copy(pose.scale);
      }
    }
    if (progress >= 1) {
      for (const pose of weaponPoses) {
        pose.object.position.copy(pose.position);
        pose.object.quaternion.copy(pose.quaternion);
        pose.object.scale.copy(pose.scale);
      }
      weaponAnimation = undefined;
    }
  };

  return {
    group,
    attachModel(model: THREE.Object3D): void {
      fallback.visible = false;
      weaponPoses = [];
      model.traverse((node) => {
        if (HERO_HIDDEN_WEAPONS.has(node.name)) {
          node.visible = false;
          return;
        }
        if (!HERO_WEAPON_LOADOUT.has(node.name)) return;
        const pose: WeaponPose = {
          object: node,
          position: node.position.clone(),
          quaternion: node.quaternion.clone(),
          scale: node.scale.clone(),
          // Start just above the hand and nearly collapsed. triggerWeaponAnimation
          // will reveal the loadout with an intentional equip beat.
          equipPosition: node.position.clone().add(weaponEquipOffset),
          equipQuaternion: node.quaternion.clone(),
          equipScale: node.scale.clone().multiplyScalar(0.08),
        };
        weaponPoses.push(pose);
        node.visible = true;
      });
      group.add(model);
      weaponAnimation = undefined;
    },
    showFallback(): void {
      fallback.visible = true;
    },
    setRunCycle(speed: number, elapsed: number, airborne: boolean): void {
      const amount = Math.min(1, speed / 8);
      const swing = Math.sin(elapsed * (airborne ? 5 : 14)) * 0.75 * amount;
      leftLeg.rotation.x = airborne ? -0.45 : swing;
      rightLeg.rotation.x = airborne ? 0.45 : -swing;
      leftArm.rotation.x = airborne ? 0.55 : -swing * 0.8;
      rightArm.rotation.x = airborne ? -0.55 : swing * 0.8;
      body.position.y = 1.1 + (airborne ? 0.03 : Math.abs(swing) * 0.05);
      updateWeaponAnimation(elapsed);
    },
    setHurt(active: boolean): void {
      visor.emissiveIntensity = active ? 0.35 : 1.7;
      suitAccent.emissiveIntensity = active ? 2.2 : 0.8;
    },
    triggerWeaponAnimation(animation: HeroWeaponAnimation, elapsed: number): void {
      if (weaponPoses.length === 0) return;
      if (animation === 'equip') {
        for (const pose of weaponPoses) {
          pose.object.position.copy(pose.equipPosition);
          pose.object.quaternion.copy(pose.equipQuaternion);
          pose.object.scale.copy(pose.equipScale);
        }
      } else {
        for (const pose of weaponPoses) {
          pose.object.position.copy(pose.position);
          pose.object.quaternion.copy(pose.quaternion);
          pose.object.scale.copy(pose.scale);
        }
      }
      weaponAnimation = {
        kind: animation,
        start: elapsed,
        duration: animation === 'equip' ? 0.72 : 0.54,
      };
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
