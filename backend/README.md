# The inquiry service

One Supabase Edge Function that receives a Private Architecture Review inquiry, stores it, and emails it to `andrew@andmaverick.com`.

It runs on its own free Supabase project (`anuebllwpeenjowagvxy`). No new server and no CRM: the table is the CRM.

```
visitor's browser  --POST JSON-->  /functions/v1/inquiry  --> inquiries table (the record)
                                                          --> Resend  --> andrew@andmaverick.com
```

## What it does

- Validates every field on the server, whatever the browser did.
- Accepts requests only from the site's own origins, with a hidden honeypot field, a fast-submission flag, a per-address limit (5 an hour) and a global limit (40 an hour).
- Keeps the visitor's PAR reference as an idempotency key, so a double click or a retry after a failure cannot produce two emails or two rows.
- Drops modeled financial assumptions unless the request carries `mdqConsent: true`.
- Replies `{ ok: true, ref }` only after the email has been accepted for delivery. Otherwise `502`, and the browser keeps the visitor's text and offers a retry.
- Stores the inquiry before emailing, so a delivery failure never loses the record.
- Sends a structured notification: who, organization, what they want, scale, what caught their attention, where they came from, signals, and the reference. `Reply-To` is the visitor.

## Accounts and costs

| Item | Why | Cost |
|---|---|---|
| [Resend](https://resend.com) with `andmaverick.com` verified (DKIM, `rsend` and `send` CNAMEs, DMARC at Namecheap) | Sends the notification from your own domain | Free plan: 3,000 emails a month, 100 a day |
| A Supabase project | Hosts the function and the `inquiries` table | Free plan covers 500,000 function invocations a month |

Figures were read on 2026-11-08. Confirm them at signup.

## Deploy

1. Run `supabase/migrations/20261108000000_inquiries.sql` in the SQL editor (creates `public.inquiries` and the `inquiry_funnel` view, locked to the service role).
2. Create the function `inquiry` from `supabase/functions/inquiry/` (CLI: `supabase functions deploy inquiry`; or paste a single-file bundle of `lib.ts`, `handler.ts`, `index.ts` into the dashboard editor). Leave **Verify JWT on**.
3. Set secrets (Edge Functions, Secrets). Never commit them:
   - `RESEND_API_KEY` (a Resend key with sending access)
   - `INQUIRY_FROM` = `AndMaverick <inquiries@andmaverick.com>`
   - optional `INQUIRY_TO` (defaults to `andrew@andmaverick.com`) and `ALLOWED_ORIGINS` (defaults to the GitHub Pages site and andmaverick.com)

`SUPABASE_URL` and the service role key are injected by Supabase and exist nowhere in this repository.

The page calls the function with the project's public anon key, which only passes the platform's JWT check. It grants no database access: the table is closed to `anon`. The real gates are the origin allow list, server validation, the honeypot and the rate limits.

## Tests

```bash
deno test --no-check backend/tests/inquiry_test.ts
```

The tests drive the real handler with an in-memory stand-in for Resend and the table. They cover success, validation, origin checks, the honeypot, consent for modeled assumptions, delivery failure and retry, duplicate submission, rate limiting, the table being unavailable, and header and markup injection. The browser side is covered by `tests/e2e_inquiry.py`, which talks to `tests/mock_inquiry_server.py` and never reaches a real service.
