import { Game } from './game/game.js';
import './style.css';

const app = document.getElementById('app');
const game = new Game(app);
game.start();
