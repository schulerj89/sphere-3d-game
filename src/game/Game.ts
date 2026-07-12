import { AudioDirector } from './AudioDirector';
import { DesktopInput } from './Input';

export class Game {
  private readonly input: DesktopInput;
  private readonly audio = new AudioDirector();

  constructor(private readonly root: HTMLDivElement) {
    this.input = new DesktopInput(root);
  }

  start(): void {
    this.root.innerHTML = `
      <section class="boot-screen" aria-label="Starbound Sprint loading screen">
        <p class="boot-kicker">STARBOUND SPRINT</p>
        <p class="boot-copy">Preparing the first orbit…</p>
        <button class="boot-button" type="button">Begin</button>
      </section>`;
    this.root.querySelector<HTMLButtonElement>('.boot-button')?.addEventListener('click', () => this.audio.start(), { once: true });
  }

  dispose(): void {
    this.input.destroy();
    this.audio.dispose();
  }
}
