// Idempotent, non-destructive migration when a production database is configured.
if (process.env.DATABASE_URL) {
  await import("./migrate");
} else
  console.warn(
    "DATABASE_URL is not set. Live directory and admin access will remain unavailable until configured; no sample data is used.",
  );
for (const name of [
  "APP_URL",
  "SESSION_SECRET",
  "SMTP_USER",
  "SMTP_PASS",
]) {
  if (!process.env[name])
    console.warn(
      `${name} is not configured. Complete the production setup before inviting participants.`,
    );
}
export {};
