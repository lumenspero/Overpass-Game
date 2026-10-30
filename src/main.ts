import './style.css';

const app = document.querySelector('#app');

app.innerHTML = `
  <main>
    <h1>My App</h1>
    <p>It works.</p>
    <button id="counter" type="button">Clicked 0 times</button>
    <small>mode: ${import.meta.env.MODE} · built: ${__BUILD_TIME__}</small>
  </main>
`;

let count = 0;
const button = document.querySelector('#counter');
button.addEventListener('click', () => {
  count += 1;
  button.textContent = `Clicked ${count} times`;
});
