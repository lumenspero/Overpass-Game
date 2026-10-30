import Phaser from 'phaser';
import './style.css';
import { GameScene } from './game/game-scene.ts';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app element not found');

new Phaser.Game({
  type: Phaser.AUTO,
  parent: root,
  banner: false,
  backgroundColor: '#111111',
  scale: { mode: Phaser.Scale.RESIZE },
  scene: [GameScene],
});

root.dataset.booted = 'true';
