// Triggers a cron route on the local dev server, like Vercel Cron does.
//   npm run cron -- tontines            run the tontine job for today
//   npm run cron -- tontines 2026-11-20 simulate another day (dev only)
//   npm run cron -- reconcile
import { readFileSync } from "node:fs";

const [job = "tontines", date] = process.argv.slice(2);
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((line) => /^([A-Z_]+)=(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);
const base = process.env.APP_URL ?? env.APP_URL ?? "http://localhost:3000";
const url = new URL(`/api/cron/${job}`, base);
if (date) url.searchParams.set("date", date);

const response = await fetch(url, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
console.log(response.status, JSON.stringify(await response.json(), null, 2));
process.exitCode = response.ok ? 0 : 1;
