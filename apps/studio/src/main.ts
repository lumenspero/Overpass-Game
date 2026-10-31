import { h, render } from 'preact';
import './style.css';
import { App } from './app.ts';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app element not found');
render(h(App, null), root);
root.dataset.booted = 'true';
