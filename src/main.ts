import { Game } from './game/Game';
import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Starbound Sprint could not find its application root.');
}

new Game(app).start();
