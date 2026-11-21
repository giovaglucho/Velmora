const style = document.createElement('style');
style.textContent = `
  :root { color-scheme: dark; }
  html, body { height: 100%; margin: 0; }
  body {
    background: radial-gradient(ellipse at 50% 40%, #2a1d16 0%, #14100d 70%);
    color: #e8d9c3;
    font-family: Georgia, 'Times New Roman', serif;
    display: grid; place-items: center; text-align: center;
  }
  h1 { font-size: clamp(2rem, 6vw, 3.5rem); letter-spacing: .06em; margin: 0 0 .5rem; color: #f0b968; }
  p { margin: 0 0 1.5rem; opacity: .85; }
  a { color: #d9763a; }
  a:hover { color: #f0b968; }
`;
document.head.append(style);

const app = document.getElementById('app');
if (app) {
  app.innerHTML = `
    <main>
      <h1>Reinos de Ceniza</h1>
      <p>Reinos de Ceniza — en construcción</p>
      <a href="/devlog/">Ver el devlog</a>
    </main>`;
}
