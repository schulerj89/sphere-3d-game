type SoundName = 'confirm' | 'jump' | 'coin' | 'pounce' | 'hit' | 'launch' | 'complete';
type MusicTrack = 'gameplay' | 'cinematic';

const audioPath = (path: string): string => `${import.meta.env.BASE_URL}assets/audio/${path}`;

/**
 * Plays the bundled CC0 tracks/SFX after a gesture, with a lightweight
 * synthesized score and effects as an offline/network-failure fallback.
 */
export class AudioDirector {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private musicGain: GainNode | undefined;
  private loopTimer: number | undefined;
  private music: HTMLAudioElement | undefined;
  private musicSource: string | undefined;
  private muted = false;
  private usingAssetMusic = false;

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
    this.setMusicTrack('gameplay');
  }

  setCinematic(active: boolean): void {
    if (!this.context) return;
    this.setMusicTrack(active ? 'cinematic' : 'gameplay');
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.42;
    if (this.music) this.music.muted = this.muted;
    return this.muted;
  }

  play(sound: SoundName): void {
    if (this.muted) return;
    const effectPaths: Record<SoundName, string> = {
      confirm: 'sfx/ui-confirm.wav',
      jump: 'sfx/jump.wav',
      coin: 'sfx/coin.mp3',
      pounce: 'sfx/enemy-pounce.wav',
      hit: 'sfx/hurt.wav',
      launch: 'sfx/dash.wav',
      complete: 'sfx/ui-confirm.wav',
    };
    const effect = new Audio(audioPath(effectPaths[sound]));
    effect.volume = sound === 'launch' ? 0.38 : 0.34;
    effect.playbackRate = sound === 'coin' ? 0.94 + Math.random() * 0.16 : 1;
    void effect.play().catch(() => this.playSynthEffect(sound));
  }

  dispose(): void {
    if (this.loopTimer !== undefined) window.clearTimeout(this.loopTimer);
    this.music?.pause();
    this.music = undefined;
    void this.context?.close();
  }

  private setMusicTrack(track: MusicTrack, useCc0Fallback = false): void {
    const source = track === 'gameplay'
      ? useCc0Fallback ? 'cc0-gameplay' : 'elevenlabs-gameplay'
      : 'cc0-cinematic';
    if (this.musicSource === source && this.music) return;
    this.music?.pause();
    const file = source === 'elevenlabs-gameplay'
      ? 'music/elevenlabs-starbound-sprint.mp3'
      : source === 'cc0-gameplay'
        ? 'music/orbital-action.mp3'
        : 'music/space-flight.mp3';
    const next = new Audio(audioPath(file));
    next.loop = true;
    next.volume = track === 'gameplay' ? 0.36 : 0.3;
    next.muted = this.muted;
    this.music = next;
    this.musicSource = source;
    this.usingAssetMusic = false;
    void next.play().then(() => {
      if (this.music !== next) return;
      this.usingAssetMusic = true;
      if (this.loopTimer !== undefined) {
        window.clearTimeout(this.loopTimer);
        this.loopTimer = undefined;
      }
    }).catch(() => {
      if (this.music !== next || this.usingAssetMusic) return;
      if (track === 'gameplay' && !useCc0Fallback) {
        this.setMusicTrack('gameplay', true);
      } else if (this.loopTimer === undefined) {
        this.scheduleMusic();
      }
    });
  }

  private playSynthEffect(sound: SoundName): void {
    if (!this.context || !this.master || this.muted) return;
    const now = this.context.currentTime;
    const profile: Record<SoundName, [number, number, number, OscillatorType]> = {
      confirm: [420, 740, 0.13, 'triangle'],
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

  private scheduleMusic(): void {
    if (!this.context || !this.musicGain || this.usingAssetMusic) return;
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
