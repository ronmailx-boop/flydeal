const TRAVELPAYOUTS_URL = 'https://api.travelpayouts.com/v1/prices/cheap';
const ORIGIN = 'TLV';
const DEFAULT_MAX_PRICE = 100;
const PRICE_PRESETS = [50, 100, 150, 200, 300];
const KV_KEY = 'latest';

async function fetchCheapFlights(token) {
  const url = `${TRAVELPAYOUTS_URL}?origin=${ORIGIN}&destination=-&currency=usd&token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { headers: { 'X-Access-Token': token } });
  if (!res.ok) {
    throw new Error(`Travelpayouts API HTTP ${res.status}`);
  }
  const body = await res.json();
  if (!body.success) {
    throw new Error(`Travelpayouts API error: ${body.error || 'unknown'}`);
  }
  return body.data || {};
}

function buildSearchLink(destination, departureAt) {
  const date = departureAt ? departureAt.slice(0, 10) : '';
  const q = `Flights from ${ORIGIN} to ${destination}${date ? ' on ' + date : ''}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

function extractDeals(data) {
  const deals = [];
  for (const [destination, entries] of Object.entries(data)) {
    for (const entry of Object.values(entries || {})) {
      if (typeof entry.price === 'number') {
        deals.push({
          destination,
          price: entry.price,
          airline: entry.airline || null,
          departureAt: entry.departure_at || null,
          returnAt: entry.return_at || null,
          link: buildSearchLink(destination, entry.departure_at),
        });
      }
    }
  }
  deals.sort((a, b) => a.price - b.price);
  return deals;
}

async function runScan(env) {
  const now = new Date().toISOString();
  try {
    const data = await fetchCheapFlights(env.TRAVELPAYOUTS_TOKEN);
    const deals = extractDeals(data);
    await env.DEALS.put(KV_KEY, JSON.stringify({ updatedAt: now, deals, error: null }));
  } catch (err) {
    const prev = await env.DEALS.get(KV_KEY, 'json');
    await env.DEALS.put(
      KV_KEY,
      JSON.stringify({ updatedAt: now, deals: (prev && prev.deals) || [], error: String((err && err.message) || err) })
    );
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

async function renderPage(env, maxPrice) {
  const stored = await env.DEALS.get(KV_KEY, 'json');
  const allDeals = (stored && stored.deals) || [];
  const deals = allDeals.filter((d) => d.price <= maxPrice);
  const updatedAt = stored && stored.updatedAt ? new Date(stored.updatedAt).toLocaleString('he-IL') : 'טרם עודכן';
  const error = stored && stored.error;

  const presetLinks = PRICE_PRESETS.map((p) =>
    p === maxPrice ? `<strong>$${p}</strong>` : `<a href="/?max=${p}">$${p}</a>`
  ).join(' | ');

  const rows = deals
    .map(
      (d) => `
        <tr>
          <td>${esc(d.destination)}</td>
          <td class="price">$${d.price.toFixed(0)}</td>
          <td>${esc(d.airline || '-')}</td>
          <td>${formatDate(d.departureAt)}</td>
          <td>${d.returnAt ? formatDate(d.returnAt) : '-'}</td>
          <td><a href="${esc(d.link)}" target="_blank" rel="noopener">לרכישה</a></td>
        </tr>`
    )
    .join('');

  const table = deals.length
    ? `
      <table>
        <thead>
          <tr><th>יעד</th><th>מחיר</th><th>חברת תעופה</th><th>יציאה</th><th>חזור</th><th>קישור</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
    : `<p class="empty">אין כרגע טיסות מתחת ל-$${maxPrice} מנתב"ג.</p>`;

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>טיסות זולות מישראל</title>
<style>
  body { font-family: system-ui, sans-serif; background:#f5f5f7; margin:0; padding:16px; color:#1c1c1e; }
  h1 { font-size:1.3em; }
  .meta { color:#666; font-size:0.9em; margin-bottom:8px; }
  .presets { margin-bottom:16px; }
  .presets a { color:#0066cc; text-decoration:none; }
  .error { background:#ffe5e5; border:1px solid #ff3b30; color:#b30000; padding:10px; border-radius:8px; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; background:#fff; border-radius:10px; overflow:hidden; }
  th, td { padding:8px 10px; text-align:right; border-bottom:1px solid #eee; }
  th { background:#eef; }
  .price { color:#2e7d32; font-weight:bold; }
  .empty { color:#888; }
</style>
</head>
<body>
  <h1>טיסות זולות מ-TLV (עד $${maxPrice} לנוסע)</h1>
  <p class="meta">עודכן לאחרונה: ${esc(updatedAt)} | מתעדכן אוטומטית כל 15 דקות - רענן את הדף כדי לראות נתונים חדשים</p>
  <p class="presets">סף מחיר: ${presetLinks}</p>
  ${error ? `<div class="error">שגיאה בסריקה האחרונה: ${esc(error)} (הרשימה למטה מהסריקה המוצלחת הקודמת אם קיימת)</div>` : ''}
  ${table}
</body>
</html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=UTF-8' } });
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScan(env));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/run') {
      await runScan(env);
      return new Response('scan complete, see /', { status: 200 });
    }
    const requested = Number(url.searchParams.get('max'));
    const maxPrice = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 2000) : DEFAULT_MAX_PRICE;
    return renderPage(env, maxPrice);
  },
};
