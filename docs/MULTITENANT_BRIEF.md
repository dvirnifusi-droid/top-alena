# TopAlena Multi-Tenant — בריף תפעול (עדכני ל-2026-07-04)

בריף זה נועד להדביק לסשן חדש של Claude (גם Sonnet/Haiku) כדי להמשיך תחזוקה
בלי לקרוא את כל ההיסטוריה. הוא מתאר את הארכיטקטורה, הזרימה, ומה לעשות בכל תקלה.

## הזרימה העסקית (מה אמור לקרות)

1. לקוח נרשם ב-`topalena.com/Signup` → נוצרת שורת `Tenant` בסטטוס `pending_approval`.
   דביר מקבל מייל + WhatsApp + Pushover. הלקוח מקבל מייל אישור קבלה.
2. דביר לוחץ **"אשר והקם"** ב-`topalena.com/PlatformAdmin` → סטטוס `pending_provisioning` + נוצר `ProvisioningJob`.
3. cron על ה-VPS (כל דקה) מריץ `provisioner-cron.sh` → מושך job → מריץ `provision-tenant.sh`:
   schema `tenant_<slug>` + העתקת טבלאות + container `tenant-<slug>-api` + block ב-Caddyfile.
4. הסקריפט מדווח ל-`reportProvisioningResult` → סטטוס `live` → `sendWelcomeForTenant` שולח
   ללקוח SMS + מייל עם קישור, סיסמה זמנית (`TopAlena-XXXX`), וקישור wa.me שפותח שיחה עם סוכן ההקמה.
5. הלקוח לוחץ על קישור הוואטסאפ → סוכן onboarding אוסף שם/כתובת/שעות/תפריט → נשמר ל-`RestaurantProfile` של הטננט.

## ארכיטקטורה

- **VPS**: Hetzner `91.98.45.253` (SSH חסום מהworkstation של דביר — הוא משתמש בקונסולת Hetzner בדפדפן, שמקלקלת RTL: `|` הופך `\`, `+` נבלע. תמיד לתת פקודות בלי pipes ובלי `+`).
- **repo על השרת**: `/opt/top-alena`, branch `migration`. autodeploy cron כל 2 דק' (`autodeploy.sh`): fetch+reset+rebuild. dist/ של הfrontend committed לgit — **אין build על השרת**.
- **repo מקומי**: `C:\Users\97253\top-alena-migration` (worktree). זרימת שינוי: edit → `npm run build` → commit → push → autodeploy מרים תוך 2 דק'.
- **DB**: Postgres משותף (Supabase). בידוד: schema-per-tenant (`tenant_<slug>`). עלינא = schema `public`.
- **קונטיינרים**: `top-alena-api-1` (עלינא), `tenant-<slug>-api` לכל טננט, `top-alena-web-1` (static), `top-alena-caddy-1`, `top-alena-minio-1`.
- **TLS**: תעודת wildcard self-signed סטטית ב-`/etc/caddy/certs/wildcard.{crt,key}` (Cloudflare במצב Full מקבל אותה). נוצרת/מתחדשת ע"י `ensure-wildcard-cert.sh` שרץ מ-autodeploy. **אסור** `tls internal` — זה גרם ל-525 על כל hostname חדש.
- **Backend fns**: הכל ב-`apps/api/src/functions/load.ts` דרך `registerFn(name, handler, {public})`. ציבורי = `POST /api/public/fn/<name>`, מאומת = `POST /api/fn/<name>`.
- **deployInfo**: `curl -X POST https://topalena.com/api/public/fn/deployInfo -d '{}' -H "Content-Type: application/json"` מחזיר את גרסת הפריסה — לבדוק אחרי כל push.

## פונקציות מפתח (load.ts)

- `requestTenantSignup` (public) — הרשמה + 4 התראות (מייל ללקוח, מייל/WA/Pushover לדביר).
- `approveTenant` / `rejectTenant` / `reprovisionTenant` — כפתורי PlatformAdmin.
- `pickNextProvisioningJob` / `reportProvisioningResult` (public, מאומת ע"י `cron_secret`) — הprotocol מול הcron. **חשוב**: הjob מחזיר `job_id` ו-`tenant_id` כשדות נפרדים (היה באג spread שדרס את id).
- `sendWelcomeForTenant(tenantId)` — helper משותף: **self-heal של הschema** (ראה למטה) → seed משתמש owner עם סיסמה חדשה → SMS+מייל+WA → כותב סטטוס לעמודות `last_welcome_*`.
- `syncTenantSchemaFromPublic(slug)` — משווה information_schema מול public ויוצר כל טבלה חסרה עם `CREATE TABLE ... (LIKE public.X INCLUDING ALL)`. זה הפתרון לכל שגיאת `42P01 relation does not exist`.
- `resendTenantWelcome` — כפתור "שלח פרטי כניסה". מרפא schema אוטומטית ואז שולח.
- `diagnoseChannels` — כפתור "הרץ בדיקה": בודק env vars + Resend + Twilio + שולח הודעות בדיקה לדביר.
- `getMyPlatformInfo` / `isSuperAdmin` — **רק** `dvirnifusi@gmail.com` (או `PLATFORM_OWNER_EMAILS` env) הוא platform owner. בעלי מסעדות עם role=owner הם לא.
- `checkStuckTenants` + `pushoverAlert` (public, cron_secret) — watchdog לטננטים תקועים.

## סקריפטים (scripts/)

- `autodeploy.sh` — cron כל 2 דק'. גם: מתקין jq אם חסר, מריץ ensure-wildcard-cert, מרוקן provisioner queue **לפני** הfast-exit, מתקין crontab לprovisioner (כל דקה).
- `provisioner-cron.sh` — מושך job אחד, מריץ provision-tenant.sh, מדווח (עם 3 retries). דורש jq. **חייב chmod 755** (cron נכשל עם Permission denied אם לא).
- `provision-tenant.sh` — schema + pg_dump copy + container + `prisma db push` (גיבוי לdump) + Caddy block.
- `sync-tenant-caddy.sh` — מוסיף blocks חסרים ל-Caddyfile; על block חדש עושה docker restart ל-Caddy + warmup.
- `ensure-wildcard-cert.sh` — יוצר/מחדש את תעודת הwildcard וממיר `tls internal` ישנים.
- `smoke-signup-flow.sh` — טסט end-to-end מלא (signup→approve→provision→HTTPS→live→welcome). להריץ לפני פתיחת הרשמה לציבור.
- `diagnose-welcome.sh <slug>` — אבחון ללא pipes לקונסולת Hetzner.

## תקלות נפוצות → פתרון (בלי טרמינל כשאפשר)

| סימפטום | סיבה | פתרון |
|---|---|---|
| שגיאה אדומה `42P01 relation tenant_X.Y does not exist` ליד טננט | טבלאות חסרות בschema | לחץ **"שלח פרטי כניסה"** — מרפא אוטומטית |
| טננט תקוע "בהתקנה" | job לא נמשך | לחץ **"התקן מחדש"**, חכה 60ש'. אם לא — בשרת: `bash /opt/top-alena/scripts/provisioner-cron.sh` |
| Cloudflare 525 על subdomain | Caddy בלי block/תעודה | `bash /opt/top-alena/scripts/sync-tenant-caddy.sh` ואז `docker restart top-alena-caddy-1` |
| לקוח לא קיבל welcome | WhatsApp session-gated (24h) — זה צפוי | SMS+מייל הם הערוצים האמינים; לחץ "שלח פרטי כניסה" ובדוק את הנקודות 📱📧💬 |
| subdomain לא קיים מציג ריק | fallback | `*.topalena.com` block בCaddyfile מפנה ל-/Signup |
| cron לא מריץ סקריפט, `Permission denied` בlog | חסר execute bit | `chmod 755 /opt/top-alena/scripts/provisioner-cron.sh` (autodeploy עושה chmod אוטומטית אחרי reset) |

## White-label

כל "עלינא" הוחלף: frontend דרך `useTenantBranding()` (`const brandName = _branding?.name || 'המסעדה'`), backend דרך `getBrandName()` + `businessContextBlock()` + `renderBrand()`. תבניות שיווק משתמשות ב-`{brand}` ש-`renderTemplate` ממלא. אסור להחזיר "עלינא" hardcoded לשום קובץ.

## פרומפט התחלה לסשן חדש (להדביק כמו שהוא)

```
אתה מתחזק את TopAlena — SaaS מולטי-טננט לניהול מסעדות.
קרא קודם את docs/MULTITENANT_BRIEF.md בworktree C:\Users\97253\top-alena-migration — כל הארכיטקטורה, הזרימה וטבלת התקלות שם.
כללים: עובדים רק על branch migration בworktree הזה; כל שינוי frontend מחייב npm run build לפני commit (dist/ בgit); push ל-origin migration מרים deploy אוטומטי תוך 2 דק'; מאמתים עם POST https://topalena.com/api/public/fn/deployInfo; לדביר אין SSH נוח — פתרונות צריכים לעבוד מכפתורים ב-PlatformAdmin, לא מהטרמינל; פקודות שרת (אם אין ברירה) — בלי pipes ובלי + (הקונסולה מקלקלת RTL).
```
