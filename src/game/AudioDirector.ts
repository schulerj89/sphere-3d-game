type SoundName = 'jump' | 'coin' | 'pounce' | 'hit' | 'launch' | 'complete';

/**
 * A tiny synthesized score and SFX bank keeps the prototype playable without
 * shipping an opaque audio asset. It can be replaced by licensed tracks later.
 */
export class AudioDirector {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private musicGain: GainNode | undefined;
  private loopTimer: number | undefined;
  private muted = false;

  start(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.context.destination);
      this.musicGain = this.context.createGain();
      this.musicGain.gain.value = 0.19;
      this.musicGain.connect(this.master);
    }

    void this.context.resume();
    if (this.loopTimer === undefined) this.scheduleMusic();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.42;
    return this.muted;
  }

  play(sound: SoundName): void {
    if (!this.context || !this.master || this.muted) return;
    const now = this.context.currentTime;
    const profile: Record<SoundName, [number, number, number, OscillatorType]> = {
      jump: [230, 520, 0.14, 'triangle'],
      coin: [740, 1320, 0.16, 'sine'],
      pounce: [180, 820, 0.22, 'square'],
      hit: [180, 72, 0.28, 'sawtooth'],
      launch: [220, 1100, 0.7, 'sine'],
      complete: [392, 1174, 0.9, 'triangle'],
    };
    const [start, end, length, type] = profile[sound];
    this.tone(start, end, length, type, sound === 'hit' ? 0.12 : 0.09, now, this.master);
    if (sound === 'coin' || sound === 'complete') {
      this.tone(end * 0.75, end * 1.06, length * 0.8, 'sine', 0.055, now + 0.07, this.master);
    }
  }

  dispose(): void {
    if (this.loopTimer !== undefined) window.clearTimeout(this.loopTimer);
    void this.context?.close();
  }

  private scheduleMusic(): void {
    if (!this.context || !this.musicGain) return;
    const now = this.context.currentTime + 0.08;
    const phrase = [
      [220, 0], [277.18, 0.38], [329.63, 0.76], [440, 1.14],
      [329.63, 1.52], [277.18, 1.9], [246.94, 2.28], [329.63, 2.66],
      [440, 3.04], [523.25, 3.42], [659.25, 3.8], [440, 4.18],
      [329.63, 4.56], [277.18, 4.94], [369.99, 5.32], [493.88, 5.7],
    ] as const;
    for (const [frequency, offset] of phrase) {
      this.tone(frequency, frequency * 1.006, 0.31, 'triangle', 0.055, now + offset, this.musicGain);
      if (offset % 0.76 === 0) {
        this.tone(frequency / 2, frequency / 2, 0.62, 'sine', 0.035, now + offset, this.musicGain);
      }
    }
    this.loopTimer = window.setTimeout(() => this.scheduleMusic(), 6400);
  }

  private tone(start: number, end: number, length: number, type: OscillatorType, volume: number, when: number, destination: AudioNode): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(start, when);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, end), when + length);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + Math.min(0.035, length * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(when);
    oscillator.stop(when + length + 0.03);
  }
}
