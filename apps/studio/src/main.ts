import './style.css';
// M0: blank boot only. Gameplay and rendering arrive in later milestones.
const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app element not found');
root.dataset.booted = 'true';
