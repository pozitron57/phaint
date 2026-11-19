// Запускается через Electron из scripts/make-icon.mjs: рисует assets/icon.svg в PNG 1024×1024 с прозрачностью.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const out = process.argv[process.argv.length - 1];

app.dock?.hide();
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../assets/icon.svg'), 'utf8');
  const win = new BrowserWindow({ width: 200, height: 200, show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html></html>');
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 1024;
      c.getContext('2d').drawImage(img, 0, 0, 1024, 1024);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('svg'));
    img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
  })`);
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  app.exit(0);
});
