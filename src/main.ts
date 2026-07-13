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
} else if (new URLSearchParams(window.location.search).get('harness') === 'assets') {
  void import('./harness/AssetHarness').then(({ AssetHarness }) => {
    new AssetHarness(app).start();
  });
} else if (new URLSearchParams(window.location.search).get('harness') === 'presentation') {
  void import('./harness/PresentationHarness').then(({ PresentationHarness }) => {
    new PresentationHarness(app).start();
  });
} else if (new URLSearchParams(window.location.search).get('harness') === 'weapon-cinematics') {
  void import('./harness/WeaponCinematicHarness').then(({ WeaponCinematicHarness }) => {
    new WeaponCinematicHarness(app).start();
  });
} else {
  new Game(app).start();
}
