import * as THREE from 'three';

interface Particle {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
}

/** One instanced draw call for the soft comet-cloud footprints behind the runner. */
export class StardustTrail {
  readonly mesh: THREE.InstancedMesh;

  private readonly particles: Particle[];
  private readonly dummy = new THREE.Object3D();
  private cursor = 0;

  constructor(count = 48) {
    const geometry = new THREE.IcosahedronGeometry(0.24, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0xd9f5ff,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.particles = Array.from({ length: count }, () => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0,
      maxLife: 1,
      active: false,
    }));
    for (let index = 0; index < count; index += 1) this.writeParticle(index);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  emit(position: THREE.Vector3, up: THREE.Vector3, heading: THREE.Vector3): void {
    const particle = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.particles.length;
    const side = new THREE.Vector3().crossVectors(up, heading).normalize();
    const scatter = (this.cursor % 2 === 0 ? 1 : -1) * (0.25 + (this.cursor % 5) * 0.07);
    particle.position.copy(position).addScaledVector(up, 0.2).addScaledVector(side, scatter);
    particle.velocity.copy(heading).multiplyScalar(-1.2 - (this.cursor % 4) * 0.18);
    particle.velocity.addScaledVector(up, 0.7 + (this.cursor % 3) * 0.16);
    particle.life = 0.62;
    particle.maxLife = particle.life;
    particle.active = true;
  }

  update(delta: number): void {
    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index];
      if (particle.active) {
        particle.life -= delta;
        if (particle.life <= 0) {
          particle.active = false;
        } else {
          particle.position.addScaledVector(particle.velocity, delta);
          particle.velocity.multiplyScalar(1 - Math.min(delta * 1.8, 0.5));
        }
      }
      this.writeParticle(index);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private writeParticle(index: number): void {
    const particle = this.particles[index];
    const amount = particle.active ? particle.life / particle.maxLife : 0;
    const scale = amount * (0.32 + (index % 3) * 0.12);
    this.dummy.position.copy(particle.position);
    this.dummy.scale.setScalar(scale);
    this.dummy.rotation.set(index * 0.4, index * 0.8, 0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(index, this.dummy.matrix);
  }
}
