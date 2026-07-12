import { Game } from './game/Game';
import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Starbound Sprint could not find its application root.');
}

if (new URLSearchParams(window.location.search).get('harness') === 'orientation') {
  void import('./harness/CharacterOrientationHarness').then(({ CharacterOrientationHarness }) => {
    new CharacterOrientationHarness(app).start();
  });
} else {
  new Game(app).start();
}
