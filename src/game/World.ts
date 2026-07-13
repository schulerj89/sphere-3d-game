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
  readonly orbitAxis: THREE.Vector3;
  readonly orbitSpeed: number;
  defeated: boolean;
  defeatAge: number;
}

export interface PlanetBoss {
  readonly normal: THREE.Vector3;
  /** Stable arena anchor used while the Warden patrols and lunges. */
  readonly arenaNormal: THREE.Vector3;
  readonly orbitAxis: THREE.Vector3;
  readonly mesh: THREE.Group;
  readonly maxHealth: number;
  health: number;
  defeated: boolean;
  defeatAge: number;
  attackPhase: BossAttackPhase;
  attackAge: number;
  attackCooldown: number;
  attackStartNormal: THREE.Vector3;
  attackTargetNormal: THREE.Vector3;
  attackHit: boolean;
}

export type BossAttackPhase = 'idle' | 'telegraph' | 'lunge' | 'recover';

export interface PlanetRelic {
  readonly source: 'rings' | 'boss';
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

function smoothstep(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function slerpNormal(from: THREE.Vector3, to: THREE.Vector3, amount: number, target: THREE.Vector3): THREE.Vector3 {
  const start = from.clone().normalize();
  const end = to.clone().normalize();
  const angle = start.angleTo(end);
  if (angle < 0.0001) return target.copy(start);
  const axis = new THREE.Vector3().crossVectors(start, end);
  if (axis.lengthSq() < 0.000001) {
    // Opposite normals have no unique great-circle axis. The boss's patrol
    // axis is stable and keeps the lunge from snapping through the planet.
    axis.set(1, 0, 0);
    if (Math.abs(axis.dot(start)) > 0.9) axis.set(0, 0, 1);
    axis.projectOnPlane(start).normalize();
  } else {
    axis.normalize();
  }
  return target.copy(start).applyAxisAngle(axis, angle * THREE.MathUtils.clamp(amount, 0, 1)).normalize();
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
    new THREE.TorusGeometry(2.25, 0.065, 8, 48),
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
    new THREE.CircleGeometry(2.18, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.11, side: THREE.DoubleSide }),
  );
  inner.rotation.x = -Math.PI / 2;
  const pillarGeometry = new THREE.CylinderGeometry(0.06, 0.12, 1.65, 6);
  const pillarMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.48 });
  for (let index = 0; index < 4; index += 1) {
    const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
    const angle = index * Math.PI / 2 + Math.PI / 4;
    pillar.position.set(Math.cos(angle) * 1.78, 0.62, Math.sin(angle) * 1.78);
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
  crown.name = 'procedural-relic-crown';
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
  const procedural = new THREE.Group();
  procedural.name = 'procedural-launch-portal';
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
  procedural.add(ring, inner, beacon);

  // This energy core remains behind either portal art so the launch target
  // still reads clearly when a low-bandwidth device uses the fallback.
  const energyRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.78, 0.045, 8, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.58, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  energyRing.name = 'launch-energy-ring';
  energyRing.rotation.x = Math.PI / 2;
  energyRing.position.y = 0.08;
  const energyCore = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  energyCore.name = 'launch-energy-circle';
  energyCore.rotation.x = -Math.PI / 2;
  energyCore.position.y = 0.065;
  const energy = new THREE.Group();
  energy.name = 'launch-energy-core';
  energy.add(energyRing, energyCore);
  group.add(procedural, energy);
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
  readonly relics: PlanetRelic[] = [];
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
      const bossOrbitAxis = new THREE.Vector3().crossVectors(definition.bossNormal, UP);
      if (bossOrbitAxis.lengthSq() < 0.001) bossOrbitAxis.set(1, 0, 0);
      else bossOrbitAxis.normalize();
      const bossAnchor = definition.bossNormal.clone().normalize();
      this.boss = {
        normal: bossAnchor.clone(),
        arenaNormal: bossAnchor.clone(),
        orbitAxis: bossOrbitAxis,
        mesh: bossMesh,
        maxHealth: definition.bossHealth ?? 5,
        health: definition.bossHealth ?? 5,
        defeated: false,
        defeatAge: 0,
        attackPhase: 'idle',
        attackAge: 0,
        // Delay the first lunge long enough for the player to read the arena
        // and the Warden's telegraph after landing on Aurora Crown.
        attackCooldown: 2.25,
        attackStartNormal: bossAnchor.clone(),
        attackTargetNormal: bossAnchor.clone(),
        attackHit: false,
      };
      const arena = createBossArena(definition.atmosphere);
      arena.position.copy(definition.bossNormal).multiplyScalar(definition.radius + 0.14);
      arena.quaternion.copy(surfaceOrientation(definition.bossNormal));
      arena.name = 'boss arena';
      this.group.add(arena, bossMesh);

      const relicAxis = new THREE.Vector3().crossVectors(definition.bossNormal, UP).normalize();
      if (relicAxis.lengthSq() < 0.001) relicAxis.set(1, 0, 0);
      const ringRelicNormal = definition.bossNormal.clone().applyAxisAngle(relicAxis, 0.16).normalize();
      const bossRelicNormal = definition.bossNormal.clone().applyAxisAngle(relicAxis, -0.16).normalize();
      const relicDefinitions: Array<{ source: PlanetRelic['source']; normal: THREE.Vector3 }> = [
        { source: 'rings', normal: ringRelicNormal },
        { source: 'boss', normal: bossRelicNormal },
      ];
      for (const relicDefinition of relicDefinitions) {
        const relicMesh = createRelic();
        relicMesh.visible = false;
        relicMesh.position.copy(relicDefinition.normal).multiplyScalar(definition.radius + 1.1);
        relicMesh.quaternion.copy(surfaceOrientation(relicDefinition.normal));
        relicMesh.name = `${relicDefinition.source} Aurora Crown relic`;
        this.relics.push({ source: relicDefinition.source, normal: relicDefinition.normal, mesh: relicMesh, collected: false });
        this.group.add(relicMesh);
      }
    }
    this.launchPad = this.createLaunchPad();
    this.group.add(this.launchPad);
  }

  get collectedCoins(): number {
    return this.coins.filter((coin) => coin.collected).length;
  }

  get isLaunchReady(): boolean {
    return this.isBossPlanet ? this.allRelicsCollected : this.collectedCoins >= this.coinTarget;
  }

  get isBossPlanet(): boolean {
    return this.boss !== undefined;
  }

  get isBossDefeated(): boolean {
    return this.boss?.defeated ?? false;
  }

  get isRelicReady(): boolean {
    return this.relics.some((relic) => !relic.collected && this.isRelicUnlocked(relic));
  }

  get relicsReady(): number {
    return this.relics.filter((relic) => !relic.collected && this.isRelicUnlocked(relic)).length;
  }

  get relicCollected(): boolean {
    return this.relicsCollected > 0;
  }

  get relicsCollected(): number {
    return this.relics.filter((relic) => relic.collected).length;
  }

  get allRelicsCollected(): boolean {
    return this.relics.length > 0 && this.relics.every((relic) => relic.collected);
  }

  worldPosition(normal: THREE.Vector3, height = 0): THREE.Vector3 {
    return normal.clone().multiplyScalar(this.definition.radius + height).add(this.definition.center);
  }

  /**
   * Replaces the synchronous launch-pad art with a shared imported prop while
   * keeping the procedural group available as a load-failure fallback.
   */
  attachLaunchPortal(source: THREE.Object3D): void {
    const model = source.clone(true);
    model.name = 'kenney launch gate';
    model.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = false;
        node.receiveShadow = false;
      }
    });
    const bounds = new THREE.Box3().setFromObject(model);
    const sourceSize = bounds.getSize(new THREE.Vector3());
    const targetSize = 3.7;
    const scale = targetSize / Math.max(0.001, Math.max(sourceSize.x, sourceSize.y, sourceSize.z));
    model.scale.setScalar(scale);
    model.rotation.y = Math.PI;
    const scaledBounds = new THREE.Box3().setFromObject(model);
    const center = scaledBounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -scaledBounds.min.y + 0.28, -center.z);
    const fallback = this.launchPad.getObjectByName('procedural-launch-portal');
    if (fallback) fallback.visible = false;
    const previous = this.launchPad.getObjectByName('kenney launch gate');
    if (previous) this.launchPad.remove(previous);
    this.launchPad.add(model);
  }

  /**
   * Replaces the simple torus crown silhouette with a shared imported relic
   * while retaining the cyan core/beam as the cheap readability fallback.
   */
  attachRelicModel(source: THREE.Object3D): void {
    for (const relic of this.relics) {
      const model = source.clone(true);
      model.name = 'quaternius aurora crown';
      model.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = false;
          node.receiveShadow = false;
        }
      });
      const bounds = new THREE.Box3().setFromObject(model);
      const sourceSize = bounds.getSize(new THREE.Vector3());
      const targetSize = 1.55;
      const scale = targetSize / Math.max(0.001, Math.max(sourceSize.x, sourceSize.y, sourceSize.z));
      model.scale.setScalar(scale);
      const scaledBounds = new THREE.Box3().setFromObject(model);
      const center = scaledBounds.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -scaledBounds.min.y + 0.24, -center.z);
      model.rotation.y = Math.PI;
      const fallback = relic.mesh.getObjectByName('procedural-relic-crown');
      if (fallback) fallback.visible = false;
      const previous = relic.mesh.getObjectByName('quaternius aurora crown');
      if (previous) relic.mesh.remove(previous);
      relic.mesh.add(model);
    }
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
    this.boss.attackPhase = 'idle';
    this.boss.attackAge = 0;
    this.boss.attackHit = false;
    return true;
  }

  collectRelicNear(normal: THREE.Vector3, threshold = 1.8): PlanetRelic | undefined {
    const relic = this.relics.find((candidate) => (
      !candidate.collected
      && this.isRelicUnlocked(candidate)
      && arcDistance(candidate.normal, normal, this.definition.radius) < threshold
    ));
    if (!relic) return undefined;
    relic.collected = true;
    relic.mesh.visible = false;
    return relic;
  }

  isNearLaunch(normal: THREE.Vector3): boolean {
    return arcDistance(this.definition.launchNormal, normal, this.definition.radius) < 2.1;
  }

  update(delta: number, bossTarget?: THREE.Vector3): void {
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
      // Voidlings patrol their local orbit instead of sitting on a static
      // marker. Mutating the surface normal keeps collision checks in sync
      // with the rendered position while preserving the low-cost instanced
      // planet decorations.
      enemy.normal.applyAxisAngle(enemy.orbitAxis, delta * enemy.orbitSpeed).normalize();
      const bob = 0.16 + Math.sin(this.elapsed * 3.2 + enemy.normal.z * 11) * 0.11;
      enemy.mesh.position.copy(enemy.normal).multiplyScalar(this.definition.radius + 0.7 + bob);
      enemy.mesh.quaternion.copy(surfaceOrientation(enemy.normal));
      enemy.mesh.rotateY(delta * 0.8);
    }
    if (this.boss) {
      if (this.boss.defeated) {
        this.boss.defeatAge += delta;
        const collapse = Math.max(0, 1 - this.boss.defeatAge * 1.35);
        this.boss.mesh.scale.setScalar(collapse);
        this.boss.mesh.rotation.y += delta * 2.4;
      } else {
        this.updateBossEncounter(delta, bossTarget);
        const attackPulse = this.boss.attackPhase === 'telegraph'
          ? 1 + Math.sin(this.boss.attackAge * 26) * 0.08
          : this.boss.attackPhase === 'lunge' ? 1.12 : 1;
        this.boss.mesh.scale.setScalar(attackPulse);
        const bob = Math.sin(this.elapsed * 2.4) * 0.18
          + (this.boss.attackPhase === 'telegraph' ? Math.sin(this.boss.attackAge * 18) * 0.09 : 0);
        this.boss.mesh.position.copy(this.boss.normal).multiplyScalar(this.definition.radius + 0.58 + bob);
        this.boss.mesh.rotateY(delta * 0.45);
        const aura = this.boss.mesh.getObjectByName('boss-aura');
        if (aura) {
          aura.rotation.z += delta * (this.boss.attackPhase === 'telegraph' ? 5.2 : 1.8);
          const auraMesh = aura as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
          auraMesh.material.opacity = this.boss.attackPhase === 'telegraph'
            ? 0.68 + Math.sin(this.boss.attackAge * 22) * 0.18
            : 0.72;
        }
      }
    }
    for (const [index, relic] of this.relics.entries()) {
      relic.mesh.visible = !relic.collected && this.isRelicUnlocked(relic);
      if (relic.mesh.visible) {
        relic.mesh.rotation.y += delta * 1.8;
        const pulse = 1 + Math.sin(this.elapsed * 5.5 + index * 1.4) * 0.1;
        relic.mesh.scale.setScalar(pulse);
      }
    }
    // The gate is a fixed landmark on each sphere. Only its energy circle
    // responds to progression; rotating the whole launch pad made the portal
    // drift under the character and read like a moving hazard.
    const charged = this.isLaunchReady;
    const launchPulse = charged ? 1.35 + Math.sin(this.elapsed * 5) * 0.45 : 0.18;
    this.launchMaterial.emissiveIntensity = launchPulse;
    const energyRing = this.launchPad.getObjectByName('launch-energy-ring') as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> | undefined;
    const energyCircle = this.launchPad.getObjectByName('launch-energy-circle') as THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial> | undefined;
    if (energyRing && energyCircle) {
      const pulse = charged ? 0.74 + Math.sin(this.elapsed * 5) * 0.2 : 0.035;
      energyRing.material.opacity = THREE.MathUtils.clamp(pulse, 0.02, 0.94);
      energyCircle.material.opacity = charged ? 0.16 + Math.sin(this.elapsed * 5) * 0.05 : 0.012;
      energyRing.scale.setScalar(charged ? 1 + Math.sin(this.elapsed * 5) * 0.04 : 1);
      energyCircle.scale.setScalar(charged ? 1 + Math.sin(this.elapsed * 5) * 0.025 : 1);
    }
  }

  /**
   * Runs the Warden's lightweight arena AI. The boss moves on the planet's
   * surface rather than teleporting, telegraphs a lunge with a pulsing aura,
   * then recovers back toward its arena anchor. Game.ts consumes `attackHit`
   * when the lunge reaches Nova so a single attack cannot drain several hearts.
   */
  private updateBossEncounter(delta: number, targetNormal?: THREE.Vector3): void {
    const boss = this.boss;
    if (!boss || !targetNormal) return;

    boss.attackCooldown = Math.max(0, boss.attackCooldown - delta);
    if (boss.attackPhase === 'idle') {
      // Keep a readable patrol orbit around the arena while waiting for Nova.
      // The small arc preserves the arena landmark and makes the boss visibly
      // alive even when the player is collecting rings on the far side.
      const patrol = Math.sin(this.elapsed * 0.72) * 0.16;
      boss.normal.copy(boss.arenaNormal).applyAxisAngle(boss.orbitAxis, patrol).normalize();
      const distance = arcDistance(boss.normal, targetNormal, this.definition.radius);
      if (boss.attackCooldown <= 0 && distance < 13.5) {
        boss.attackPhase = 'telegraph';
        boss.attackAge = 0;
        boss.attackStartNormal.copy(boss.normal);
        boss.attackTargetNormal.copy(targetNormal).normalize();
        boss.attackHit = false;
        boss.attackCooldown = 4.4;
      }
      return;
    }

    boss.attackAge += delta;
    if (boss.attackPhase === 'telegraph') {
      // Hold position while the glow and scale pulse tell the player to move.
      boss.normal.copy(boss.attackStartNormal);
      if (boss.attackAge >= 0.72) {
        boss.attackPhase = 'lunge';
        boss.attackAge = 0;
      }
      return;
    }

    if (boss.attackPhase === 'lunge') {
      const progress = THREE.MathUtils.clamp(boss.attackAge / 0.38, 0, 1);
      slerpNormal(boss.attackStartNormal, boss.attackTargetNormal, smoothstep(progress), boss.normal);
      if (progress >= 1) {
        boss.attackPhase = 'recover';
        boss.attackAge = 0;
      }
      return;
    }

    // Recover from the strike with a clear, readable return beat.
    const recover = THREE.MathUtils.clamp(boss.attackAge / 0.9, 0, 1);
    slerpNormal(boss.normal, boss.arenaNormal, smoothstep(recover), boss.normal);
    if (recover >= 1) {
      boss.attackPhase = 'idle';
      boss.attackAge = 0;
    }
  }

  private isRelicUnlocked(relic: PlanetRelic): boolean {
    return relic.source === 'boss'
      ? this.isBossDefeated
      : this.collectedCoins >= this.relicRingTarget;
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
    // Keep the silhouette intentional: landmarks, collectibles, and the
    // launch/boss beats should read before dressing. A small instanced set
    // gives each orbit texture without the noisy scatter of placeholder rocks.
    const decorationCount = this.definition.id === 'aurora' ? 18 : 14;
    for (let index = 0; index < decorationCount; index += 1) {
      const normal = normalFromLatitudeLongitude(
        -0.92 + deterministic(index * 5 + this.definition.radius) * 1.84,
        deterministic(index * 7 + this.definition.center.x) * Math.PI * 2,
      );
      if (noBuildZones.some((zone) => arcDistance(zone, normal, this.definition.radius) < 3.1)) continue;
      const scale = 0.45 + deterministic(index * 13) * 0.85;
      if (index % 4 === 0) {
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
    const cloudCount = this.definition.id === 'aurora' ? 4 : 5;
    for (let index = 0; index < cloudCount; index += 1) {
      const normal = normalFromLatitudeLongitude(
        -0.45 + deterministic(index * 19 + this.definition.radius) * 0.9,
        deterministic(index * 23 + this.definition.center.z) * Math.PI * 2,
      );
      const cloud = new THREE.Sprite(cloudMaterial);
      cloud.position.copy(normal).multiplyScalar(this.definition.radius + 0.7);
      cloud.scale.setScalar(2.35 + deterministic(index * 29) * 1.65);
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
      const orbitAxis = new THREE.Vector3().crossVectors(normal, UP);
      if (orbitAxis.lengthSq() < 0.001) orbitAxis.set(1, 0, 0);
      else orbitAxis.normalize();
      this.enemies.push({
        normal,
        mesh,
        orbitAxis,
        orbitSpeed: 0.22 + deterministic(index * 53 + this.definition.radius) * 0.36,
        defeated: false,
        defeatAge: 0,
      });
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

/**
 * The Quaternius explorer ships every weapon variant in the same scene. None
 * of those authored props are used by Starbound Sprint anymore: keeping them
 * hidden here (as well as in Game's loader) makes the mallet the only readable
 * weapon in both the authored and procedural fallback presentations.
 */
const HERO_AUTHORED_WEAPON_PATTERN = /^(Revolver|Sniper|Pistol|SMG|GrenadeLauncher|ShortCannon|Shotgun|RocketLauncher|AK|Shovel|Knife|1H_Crossbow|2H_Crossbow|Knife_Offhand|Throwable)/;

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

  // Keep one intentional weapon silhouette. The mallet is procedural so it
  // remains available when the external GLB falls back, and it can use a
  // deterministic hammer swing rather than relying on a weapon-specific clip
  // from the character source.
  const mallet = new THREE.Group();
  mallet.name = 'Nova mallet';
  const malletHandleMaterial = new THREE.MeshStandardMaterial({
    color: 0x6d8ca6,
    roughness: 0.28,
    metalness: 0.68,
  });
  const malletHeadMaterial = new THREE.MeshStandardMaterial({
    color: 0x65ecff,
    emissive: 0x0879ad,
    emissiveIntensity: 1.35,
    roughness: 0.2,
    metalness: 0.78,
  });
  const malletGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.72, 10), malletHandleMaterial);
  malletGrip.name = 'mallet handle';
  malletGrip.position.y = 0.32;
  const malletHead = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.24), malletHeadMaterial);
  malletHead.name = 'mallet head';
  malletHead.position.y = 0.76;
  const malletCore = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({
    color: 0xd9fbff,
    transparent: true,
    opacity: 0.92,
  }));
  malletCore.name = 'mallet energy core';
  malletCore.position.set(0, 0.76, 0.14);
  mallet.add(malletGrip, malletHead, malletCore);
  // The procedural fallback already lives in the hero root. Once an authored
  // model is attached the mallet is reparented to its Index1R hand bone.
  group.add(mallet);

  let malletAnchor: THREE.Object3D = mallet;
  let malletBasePosition = new THREE.Vector3(0.72, 1.2, 0.12);
  let malletBaseQuaternion = new THREE.Quaternion();
  let malletBaseScale = new THREE.Vector3(1, 1, 1);
  mallet.position.copy(malletBasePosition);
  let weaponAnimation: { kind: HeroWeaponAnimation; start: number; duration: number } | undefined;
  const malletSwingAxis = new THREE.Vector3(0, 0, 1);
  const malletSwing = new THREE.Quaternion();
  const malletFlight = new THREE.Vector3();

  const updateWeaponAnimation = (elapsed: number): void => {
    if (!weaponAnimation) return;
    const progress = THREE.MathUtils.clamp((elapsed - weaponAnimation.start) / weaponAnimation.duration, 0, 1);
    if (weaponAnimation.kind === 'equip') {
      const eased = 1 - Math.pow(1 - progress, 3);
      malletAnchor.position.copy(malletBasePosition);
      malletAnchor.quaternion.copy(malletBaseQuaternion);
      malletAnchor.scale.lerpVectors(malletBaseScale.clone().multiplyScalar(0.08), malletBaseScale, eased);
    } else {
      // Wind the mallet back, then arc it forward like a compact hammer strike.
      // The small local flight offset makes the head visibly leave the hand for
      // the impact beat, while the final reset returns it to the hand bone.
      const windup = THREE.MathUtils.clamp(progress / 0.28, 0, 1);
      const followThrough = THREE.MathUtils.clamp((progress - 0.28) / 0.72, 0, 1);
      const easedWindup = windup * windup * (3 - 2 * windup);
      const easedStrike = followThrough * followThrough * (3 - 2 * followThrough);
      const angle = -1.15 * easedWindup + 2.5 * easedStrike;
      // Convert the desired world-space hop to this anchor's local scale. The
      // GLB hand bone carries a large armature scale, so a raw 0.11 local
      // offset would launch the mallet meters away from Nova.
      const flight = Math.sin(Math.min(1, progress) * Math.PI) * 0.11 * Math.max(0.001, malletBaseScale.x);
      malletAnchor.position.copy(malletBasePosition);
      malletFlight.set(0, -flight * 0.2, -flight);
      malletAnchor.position.add(malletFlight);
      malletSwing.setFromAxisAngle(malletSwingAxis, angle);
      malletAnchor.quaternion.copy(malletBaseQuaternion).multiply(malletSwing);
      malletAnchor.scale.copy(malletBaseScale);
    }
    if (progress >= 1) {
      malletAnchor.position.copy(malletBasePosition);
      malletAnchor.quaternion.copy(malletBaseQuaternion);
      malletAnchor.scale.copy(malletBaseScale);
      weaponAnimation = undefined;
    }
  };

  return {
    group,
    attachModel(model: THREE.Object3D): void {
      fallback.visible = false;
      // Hide every authored weapon branch before adding the single procedural
      // mallet. This also covers descendants (Pistol_1, Knife_1_2, etc.) so a
      // model update cannot reintroduce a second visible prop.
      model.traverse((node) => {
        if (HERO_AUTHORED_WEAPON_PATTERN.test(node.name)) {
          node.visible = false;
        }
      });
      group.add(model);
      const hand = model.getObjectByName('Index1R') ?? model.getObjectByName('RightHand');
      const referenceWeapon = model.getObjectByName('Pistol');
      if (hand) {
        hand.add(mallet);
        // Keep animation transforms on the mallet itself; moving the hand bone
        // would distort the authored armature and make every punch look wrong.
        malletAnchor = mallet;
        // Match the hand-slot orientation from the source, but calculate scale
        // from the actual bone so this works for both authored and fallback
        // model dimensions without a giant GLB-space mallet.
        mallet.position.copy(referenceWeapon?.position ?? new THREE.Vector3(0, 0.0014, -0.00055));
        mallet.quaternion.copy(referenceWeapon?.quaternion ?? new THREE.Quaternion());
        model.updateWorldMatrix(true, true);
        const handScale = hand.getWorldScale(new THREE.Vector3());
        const inheritedScale = Math.max(0.001, Math.max(handScale.x, handScale.y, handScale.z));
        const desiredMalletLength = 0.92;
        mallet.scale.setScalar(desiredMalletLength / (1.1 * inheritedScale));
      } else {
        malletAnchor = mallet;
        mallet.position.copy(malletBasePosition);
        mallet.quaternion.identity();
        mallet.scale.set(1, 1, 1);
      }
      mallet.visible = true;
      malletBasePosition = mallet.position.clone();
      malletBaseQuaternion = mallet.quaternion.clone();
      malletBaseScale = mallet.scale.clone();
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
      if (animation === 'equip') {
        malletAnchor.position.copy(malletBasePosition);
        malletAnchor.quaternion.copy(malletBaseQuaternion);
        malletAnchor.scale.copy(malletBaseScale).multiplyScalar(0.08);
      } else {
        malletAnchor.position.copy(malletBasePosition);
        malletAnchor.quaternion.copy(malletBaseQuaternion);
        malletAnchor.scale.copy(malletBaseScale);
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
