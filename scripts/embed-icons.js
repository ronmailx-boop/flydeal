const fs = require('fs');

const b192 = fs.readFileSync('assets/icon-192.png').toString('base64');
const b512 = fs.readFileSync('assets/icon-512.png').toString('base64');
const b512m = fs.readFileSync('assets/icon-512-maskable.png').toString('base64');

let src = fs.readFileSync('src/index.js', 'utf8');

const constants = `const ICON_192_B64 = '${b192}';
const ICON_512_B64 = '${b512}';
const ICON_512_MASKABLE_B64 = '${b512m}';

function pngResponse(b64) {
  const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Response(binary, {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800' },
  });
}

const MANIFEST = JSON.stringify({
  name: 'FlyDeal - טיסות זולות מישראל',
  short_name: 'FlyDeal',
  start_url: '/',
  display: 'standalone',
  background_color: '#f5f5f7',
  theme_color: '#0ea5e9',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
});

`;

src = src.replace(
  "const TRAVELPAYOUTS_URL = 'https://api.travelpayouts.com/v1/prices/cheap';",
  constants + "const TRAVELPAYOUTS_URL = 'https://api.travelpayouts.com/v1/prices/cheap';"
);

src = src.replace(
  `    if (url.pathname === '/run') {
      await runScan(env);
      return new Response('scan complete, see /', { status: 200 });
    }`,
  `    if (url.pathname === '/run') {
      await runScan(env);
      return new Response('scan complete, see /', { status: 200 });
    }
    if (url.pathname === '/manifest.webmanifest') {
      return new Response(MANIFEST, { headers: { 'content-type': 'application/manifest+json' } });
    }
    if (url.pathname === '/icon-192.png') return pngResponse(ICON_192_B64);
    if (url.pathname === '/icon-512.png') return pngResponse(ICON_512_B64);
    if (url.pathname === '/icon-512-maskable.png') return pngResponse(ICON_512_MASKABLE_B64);`
);

src = src.replace(
  '<link rel="icon" type="image/svg+xml"',
  '<link rel="manifest" href="/manifest.webmanifest">\n<meta name="theme-color" content="#0ea5e9">\n<link rel="apple-touch-icon" href="/icon-192.png">\n<link rel="icon" type="image/svg+xml"'
);

fs.writeFileSync('src/index.js', src);
console.log('done, new size:', src.length);
