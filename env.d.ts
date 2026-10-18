// Secrets live in .dev.vars locally and as Wrangler secrets in production.
// wrangler types merges this interface with the generated Env.

interface Env {
  SESSION_SECRET: string;
  STAFF_PASSWORD: string;
  ADMIN_PASSWORD: string;
  ADMIN_EMAILS: string;
}
