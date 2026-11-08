// Supabase Edge Function: POST /functions/v1/inquiry
// Verify JWT stays on. The browser sends the project's public anon key, which only passes the platform check and reads nothing.
// Secrets live only in Supabase (see backend/README.md): RESEND_API_KEY, INQUIRY_FROM, optionally INQUIRY_TO and ALLOWED_ORIGINS.
import { handle } from "./handler.ts";

const env = (k: string) => Deno.env.get(k) ?? "";

Deno.serve((req) =>
  handle(req, {
    to: env("INQUIRY_TO") || "andrew@andmaverick.com",
    from: env("INQUIRY_FROM"),
    resendKey: env("RESEND_API_KEY"),
    allowedOrigins: (env("ALLOWED_ORIGINS") || "https://andmaverick.github.io,https://www.andmaverick.com,https://andmaverick.com").split(",").map((s) => s.trim()),
    supabaseUrl: env("SUPABASE_URL"),
    supabaseKey: env("SUPABASE_SERVICE_ROLE_KEY"),
    perEmailPerHour: 5,
    globalPerHour: 40,
  }, { fetch, now: () => Date.now(), rnd: () => Math.random().toString(36).slice(2, 6) })
);
