import cron from "node-cron";
import { env } from "../lib/env";
import { scrapeAllAccounts } from "../lib/scrape";

let running = false;

async function runScrape(trigger: string) {
  if (running) {
    console.log(`[worker] scrape already running, skipping ${trigger} trigger`);
    return;
  }
  running = true;
  const startedAt = new Date();
  console.log(`[worker] scrape started (${trigger}) at ${startedAt.toISOString()}`);
  try {
    const results = await scrapeAllAccounts();
    const totals = results.reduce(
      (acc, r) => {
        acc.found += r.found;
        acc.inserted += r.inserted;
        acc.updated += r.updated;
        if (r.error) acc.errors += 1;
        return acc;
      },
      { found: 0, inserted: 0, updated: 0, errors: 0 }
    );
    console.table(results);
    console.log(
      `[worker] scrape done: ${totals.found} found, ${totals.inserted} new, ` +
        `${totals.updated} updated, ${totals.errors} account error(s)`
    );
  } catch (err) {
    console.error("[worker] scrape failed:", err);
  } finally {
    running = false;
  }
}

function main() {
  if (!cron.validate(env.scrapeCron)) {
    throw new Error(`Invalid SCRAPE_CRON expression: "${env.scrapeCron}"`);
  }

  console.log(
    `[worker] scheduled "${env.scrapeCron}" (TZ=${env.timezone}). ` +
      `Default is 09:00 every Monday & Friday.`
  );

  cron.schedule(env.scrapeCron, () => void runScrape("cron"), {
    timezone: env.timezone,
  });

  if (env.runOnBoot) {
    void runScrape("boot");
  }

  // Keep the process alive.
  process.stdin.resume();
}

main();
