const { chromium } = require('playwright');

const PLANE = 'M2.01,21L23,12L2.01,3L2,10l15,2l-15,2L2.01,21z';

function markup(maskable) {
  const bgShape = maskable
    ? '<rect x="0" y="0" width="24" height="24" fill="url(#bg)"/>'
    : '<circle cx="12" cy="12" r="12" fill="url(#bg)"/>';
  const planeTransform = maskable ? 'translate(6,6) scale(0.5)' : 'translate(3.6,3.6) scale(0.7)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0ea5e9"/>
        <stop offset="100%" stop-color="#22c55e"/>
      </linearGradient>
    </defs>
    ${bgShape}
    <g transform="${planeTransform}">
      <path d="${PLANE}" fill="#ffffff"/>
    </g>
  </svg>`;
}

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const targets = [
    { file: 'assets/icon-192.png', size: 192, maskable: false },
    { file: 'assets/icon-512.png', size: 512, maskable: false },
    { file: 'assets/icon-512-maskable.png', size: 512, maskable: true },
  ];
  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size } });
    await page.setContent(
      `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0;width:${t.size}px;height:${t.size}px;}</style></head><body>${markup(t.maskable)}</body></html>`
    );
    await page.screenshot({ path: t.file, omitBackground: !t.maskable });
    await page.close();
    console.log('wrote', t.file);
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
