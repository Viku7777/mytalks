# Step 1 — Titan SMTP setup (MyTalk)

Do this before booking emails. You only need a working mailbox + password.

MyTalk mail is on **BigRock Titan**. Use the BigRock login, not `mail.titan.email`.

## A. In Titan (web) — BigRock

1. Open webmail: [https://bigrock.titan.email/mail/](https://bigrock.titan.email/mail/)  
   (or login page: [https://bigrock.titan.email/login/](https://bigrock.titan.email/login/))
2. Sign in with `admin@mytalk.in` and your mailbox password.
3. Confirm you can open the inbox (proves the password is correct).
4. Click the **Settings** icon (top right).
5. Click **Enable Titan on Other Apps** and confirm.  
   If you already see **Configure 3rd party apps**, third-party access is already on.
6. If **2FA** is on, create an **Application Password** and use that as `SMTP_PASS`.

SMTP host stays the same for BigRock Titan: `smtp.titan.email` (port `465`).  
See BigRock’s guide: [Email Setup Guide for Titan](https://www.bigrock.in/help/article/Email-Setup-Guide-for-Titan).

## B. SMTP values (copy these)

| Field | Value |
| --- | --- |
| Host | `smtp.titan.email` |
| Port | `465` (SSL) **or** `587` (STARTTLS) |
| Username | full address, e.g. `bookings@mytalk.in` |
| Password | mailbox password or app password |
| From | same as username |

## C. On this computer

```bash
cd mail
cp .env.example .env
```

Edit `mail/.env`:

```env
SMTP_USER=bookings@mytalk.in
SMTP_PASS=paste-your-password-here
SMTP_FROM_NAME=MyTalk Bookings
SMTP_HOST=smtp.titan.email
SMTP_PORT=465
SMTP_SECURE=true
SMTP_TEST_TO=your-gmail-or-phone-email@example.com
```

Then:

```bash
npm install
npm run test:smtp
```

You should see `SMTP login OK` and a test message in `SMTP_TEST_TO`.

## D. If the test fails

1. Confirm third-party access is enabled in Titan.
2. Switch to port 587:
   ```env
   SMTP_PORT=587
   SMTP_SECURE=false
   ```
3. Use an Application Password if 2FA is on.
4. Wait a few minutes after too many wrong password attempts (Titan can block the IP).

## Step 2 — Templates (production)

Templates live in `mail/templates.js` and use **real booking fields only** (no demo data).

| Event | When |
| --- | --- |
| `pending` | User submits Book a Session |
| `confirmed` | Admin confirms |
| `time-changed` | Admin updates date/time |
| `advisor-changed` | Admin changes advisor |
| `cancelled` | Admin cancels |
| `completed` | Admin marks session complete |
| `reminder` | Optional reminder |

Optional preview to your test inbox:

```bash
cd mail && npm run send:templates
```

## Step 3 — Live sending on Vercel (required or live emails fail)

`mail/.env` is **local only** (gitignored). Production does **not** get those values until you add them in Vercel.

Without this, `https://mytalk.in/api/send-booking-email` returns:
`Missing SMTP_USER or SMTP_PASS`.

1. Open Vercel → your **mytalk** project → **Settings** → **Environment Variables**.
2. Add these for **Production** (and Preview if you want preview deploys to send mail):

| Name | Value |
| --- | --- |
| `SMTP_USER` | `admin@mytalk.in` |
| `SMTP_PASS` | *(same Titan password as in local `mail/.env`)* |
| `SMTP_FROM_NAME` | `MyTalk Bookings` |
| `SMTP_HOST` | `smtp.titan.email` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |

3. **Redeploy** (Deployments → ⋮ on latest → Redeploy). Env vars apply only after a new deploy.
4. Book a session / confirm in admin — the user should get the email.

API route: `POST /api/send-booking-email`
