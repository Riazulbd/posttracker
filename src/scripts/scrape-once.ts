/**
 * Run a single scrape immediately, then exit. Useful for testing your Apify
 * credentials/actors and seeding the table for the first time.
 *
 *   npm run scrape
 */
import "dotenv/config"; // load .env (no-op in Docker where env is already set)
import { scrapeAllAccounts } from "../lib/scrape";

async function main() {
  console.log("[scrape-once] starting one-off scrape...");
  const results = await scrapeAllAccounts();
  console.table(results);
  const hadError = results.some((r) => r.error);
  process.exit(hadError ? 1 : 0);
}

main().catch((err) => {
  console.error("[scrape-once] fatal:", err);
  process.exit(1);
});
