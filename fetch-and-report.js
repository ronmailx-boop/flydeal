#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const puppeteer = require('puppeteer-core');
const { createScraper, CompanyTypes } = require('israeli-bank-scrapers');

const LOOKBACK_DAYS = 14;
const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';
const STATE_FILE = path.join(__dirname, 'state', 'fingerprints.json');
const REPORT_FILE = path.join(__dirname, 'report.html');

// כל חשבון: envPrefix הוא רק לתיעוד, primaryVar הוא המשתנה שקובע אם הבלוק
// מוגדר בכלל (אם הוא ריק/undefined, מדלגים על החשבון בשקט). buildCredentials
// בונה בדיוק את האובייקט שהספרייה מצפה לו לפי התיעוד הרשמי של כל חברה.
const ACCOUNTS = [
  {
    label: 'בנק לאומי',
    companyId: CompanyTypes.leumi,
    primaryVar: 'LEUMI_USERNAME',
    buildCredentials: (env) => ({ username: env.LEUMI_USERNAME, password: env.LEUMI_PASSWORD }),
  },
  {
    label: 'ויזה מקס',
    companyId: CompanyTypes.max,
    primaryVar: 'MAX_USERNAME',
    buildCredentials: (env) => ({ username: env.MAX_USERNAME, password: env.MAX_PASSWORD }),
  },
  {
    label: 'ויזה כאל',
    companyId: CompanyTypes.visaCal,
    primaryVar: 'VISACAL_USERNAME',
    buildCredentials: (env) => ({ username: env.VISACAL_USERNAME, password: env.VISACAL_PASSWORD }),
  },
];

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveState(fingerprints) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify([...fingerprints], null, 2));
}

function fingerprint(companyId, accountNumber, txn) {
  const raw = [companyId, accountNumber, txn.identifier ?? '', txn.date, txn.chargedAmount, txn.description].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function maskAccount(accountNumber) {
  const digits = String(accountNumber || '').replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return '*'.repeat(digits.length - 4) + digits.slice(-4);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function formatMoney(n) {
  const sign = n < 0 ? '-' : '';
  return sign + '₪' + Math.abs(n).toFixed(2);
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

function startDate() {
  const d = new Date();
  d.setDate(d.getDate() - LOOKBACK_DAYS);
  return d;
}

function buildReport(results, generatedAt) {
  const failed = results.filter((r) => !r.ok);
  const titleParts = ['דוח בנקים - ' + generatedAt];
  if (failed.length) titleParts.unshift('⚠ שגיאה ב-' + failed.length + ' חשבונות');
  const title = titleParts.join(' | ');

  let grandTotal = 0;
  let grandCount = 0;

  const sections = results
    .map((r) => {
      if (!r.ok) {
        return `
      <section class="account error">
        <h2>${esc(r.label)}</h2>
        <p class="error-banner">שגיאה בשליפת הנתונים: ${esc(r.error)}</p>
      </section>`;
      }

      const rows = r.newTxns
        .map((t) => {
          const amountClass = t.chargedAmount < 0 ? 'debit' : 'credit';
          grandTotal += t.chargedAmount;
          grandCount += 1;
          const pending = t.status === 'pending' ? '<span class="pending">ממתין</span>' : '';
          return `
        <tr>
          <td>${formatDate(t.date)}</td>
          <td>${esc(t.description)}</td>
          <td class="${amountClass}">${formatMoney(t.chargedAmount)}</td>
          <td>${pending}</td>
        </tr>`;
        })
        .join('');

      const accountTotal = r.newTxns.reduce((sum, t) => sum + t.chargedAmount, 0);

      const table = r.newTxns.length
        ? `
      <table>
        <thead><tr><th>תאריך</th><th>תיאור</th><th>סכום</th><th>סטטוס</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="2">סה"כ עסקאות חדשות</td><td class="${accountTotal < 0 ? 'debit' : 'credit'}">${formatMoney(accountTotal)}</td><td></td></tr></tfoot>
      </table>`
        : '<p class="empty">אין עסקאות חדשות</p>';

      return `
      <section class="account">
        <h2>${esc(r.label)} <span class="account-number">חשבון ${esc(maskAccount(r.accountNumber))}</span></h2>
        ${r.balance != null ? `<p class="balance">יתרה נוכחית: ${formatMoney(r.balance)}</p>` : ''}
        ${table}
      </section>`;
    })
    .join('\n');

  const failedBanner = failed.length
    ? `<div class="top-error">⚠ שגיאה ב-${failed.length} מתוך ${results.length} חשבונות — בדוק את הפירוט למטה</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; background:#f5f5f7; margin:0; padding:16px; color:#1c1c1e; }
  h1 { font-size:1.3em; }
  .top-error { background:#ffe5e5; border:1px solid #ff3b30; color:#b30000; padding:12px; border-radius:8px; margin-bottom:16px; font-weight:bold; }
  section.account { background:#fff; border-radius:10px; padding:16px; margin-bottom:16px; box-shadow:0 1px 3px rgba(0,0,0,.1); }
  section.error { border:1px solid #ff3b30; }
  .error-banner { color:#b30000; font-weight:bold; }
  .account-number { font-weight:normal; color:#666; font-size:0.8em; }
  .balance { color:#444; }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  th, td { padding:6px 8px; text-align:right; border-bottom:1px solid #eee; }
  .debit { color:#d32f2f; font-weight:bold; }
  .credit { color:#2e7d32; font-weight:bold; }
  .pending { background:#fff3cd; color:#856404; padding:2px 6px; border-radius:4px; font-size:0.8em; }
  .empty { color:#888; }
  footer { color:#888; font-size:0.8em; margin-top:16px; }
</style>
</head>
<body>
  ${failedBanner}
  <h1>דוח עסקאות חדשות — ${esc(generatedAt)}</h1>
  <p>סה"כ ${grandCount} עסקאות חדשות בכל החשבונות: <strong class="${grandTotal < 0 ? 'debit' : 'credit'}">${formatMoney(grandTotal)}</strong></p>
  ${sections}
  <footer>נוצר אוטומטית ע"י fetch-and-report.js. הדוח הזה נשמר מקומית בלבד על המכשיר.</footer>
</body>
</html>`;
}

async function run() {
  const env = process.env;
  const state = loadState();
  const results = [];

  const browser = await puppeteer.connect({ browserURL: CDP_URL });

  for (const acc of ACCOUNTS) {
    if (!env[acc.primaryVar]) {
      continue; // בלוק ריק - דילוג שקט
    }
    try {
      const scraper = createScraper({
        companyId: acc.companyId,
        startDate: startDate(),
        browser,
        skipCloseBrowser: true,
      });

      const scrapeResult = await scraper.scrape(acc.buildCredentials(env));

      if (!scrapeResult.success) {
        results.push({ label: acc.label, ok: false, error: scrapeResult.errorType || 'GENERIC' });
        continue;
      }

      for (const account of scrapeResult.accounts || []) {
        const newTxns = [];
        for (const txn of account.txns || []) {
          const fp = fingerprint(acc.companyId, account.accountNumber, txn);
          if (!state.has(fp)) {
            state.add(fp);
            newTxns.push(txn);
          }
        }
        results.push({
          label: acc.label,
          ok: true,
          accountNumber: account.accountNumber,
          balance: account.balance,
          newTxns,
        });
      }
    } catch (err) {
      results.push({ label: acc.label, ok: false, error: err.message });
    }
  }

  await browser.disconnect();

  saveState(state);

  const generatedAt = new Date().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  fs.writeFileSync(REPORT_FILE, buildReport(results, generatedAt), 'utf8');
  console.log('Report written to', REPORT_FILE);

  const failedCount = results.filter((r) => !r.ok).length;
  if (failedCount > 0) {
    console.error(failedCount + ' account(s) failed - see report for details');
  }
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
