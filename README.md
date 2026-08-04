# FlyDeal — טיסות זולות מישראל

אתר שסורק אוטומטית כל 15 דקות טיסות זולות (עד 100$ לנוסע, כברירת מחדל)
היוצאות מנתב"ג (TLV) לכל יעד, ומציג אותן ברשימה עם קישור ישיר לחיפוש/רכישה.

**האתר:** https://cheap-flights-agent.ronmailx.workers.dev/
(גם זמין דרך https://ronmailx-boop.github.io/flydeal/ - מפנה לאותו מקום)

## איך זה עובד

- **מקור הנתונים:** [Travelpayouts / Aviasales Data API](https://www.travelpayouts.com/)
  (`v1/prices/cheap`) - קריאה אחת שמחזירה את המחירים הזולים הידועים מ-TLV
  לכל היעדים.
- **הרצה:** [Cloudflare Worker](https://developers.cloudflare.com/workers/)
  עם [Cron Trigger](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
  שסורק כל 15 דקות ושומר את התוצאות ב-Cloudflare KV.
- **תצוגה:** אותו Worker מגיש דף HTML יחיד, RTL בעברית, שקורא את הנתונים
  מ-KV בכל בקשה - כך שכל רענון של הדף מציג את המצב העדכני ביותר.
- ניתן לשנות את סף המחיר בכתובת עצמה, למשל `?max=200` לטיסות עד 200$.
- **פריסה (deploy):** אוטומטית דרך GitHub Actions (`.github/workflows/deploy.yml`)
  בכל push לתיקיית `src/` או ל-`wrangler.toml`.

## קבצים

- `src/index.js` - כל הלוגיקה (סריקה + שרת דף האינטרנט).
- `wrangler.toml` - הגדרת ה-Worker, ה-KV namespace וה-Cron Trigger.
- `.github/workflows/deploy.yml` - פריסה אוטומטית ל-Cloudflare.
- `index.html` - עמוד הפניה סטטי ל-GitHub Pages (מפנה לכתובת ה-Worker
  האמיתי, כי GitHub Pages לא יכול להריץ קוד שרת/secrets).

## Secrets

שום מפתח/טוקן לא נמצא בקוד. הכל מוגדר כ-secrets:

- ב-GitHub (`Settings → Secrets and variables → Actions`):
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `TRAVELPAYOUTS_TOKEN`.
- ה-`TRAVELPAYOUTS_TOKEN` מועבר אוטומטית מ-GitHub ל-Cloudflare Worker secret
  בכל דיפלוי (דרך `wrangler-action`).
