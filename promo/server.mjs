// Static server for the promo renderer: repo assets, game source, promo scene, three.js.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const routes = [
  ['/assets/', path.join(repo, 'public/assets/')],
  ['/src/', path.join(repo, 'src/')],
  ['/three/', path.join(here, 'node_modules/three/')],
  ['/fonts/', path.join(here, 'node_modules/@fontsource/')],
  ['/', path.join(here, 'scene/')],
];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff' };

export function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const [prefix, dir] = routes.find(([p]) => url.startsWith(p));
    const file = path.join(dir, url.slice(prefix.length) || 'index.html');
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startServer(Number(process.env.PORT || 5178));
  console.log(`promo scene at http://127.0.0.1:${s.address().port}/`);
}
