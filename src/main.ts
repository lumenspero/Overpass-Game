import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app element not found');

app.innerHTML = `
  <main>
    <h1>Overpass_Game</h1>
    <p>It works.</p>
    <button id="counter" type="button">Clicked 0 times</button>
    <small>mode: ${import.meta.env.MODE} · built: ${__BUILD_TIME__}</small>
  </main>
`;

const button = app.querySelector<HTMLButtonElement>('#counter');
if (!button) throw new Error('#counter button not found');

let count = 0;
button.addEventListener('click', () => {
  count += 1;
  button.textContent = `Clicked ${count} times`;
});
