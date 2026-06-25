import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { scrapeAllAccounts } from "@/lib/scrape";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // allow long-running scrapes

/**
 * Manually trigger a scrape:
 *   curl -X POST https://your-host/api/scrape \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * Protected by CRON_SECRET. If CRON_SECRET is unset, the endpoint is disabled.
 */
export async function POST(req: NextRequest) {
  if (!env.cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured; manual scrape is disabled." },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token !== env.cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await scrapeAllAccounts();
    const totals = results.reduce(
      (acc, r) => {
        acc.scanned += r.scanned;
        acc.matched += r.matched;
        acc.inserted += r.inserted;
        acc.updated += r.updated;
        return acc;
      },
      { scanned: 0, matched: 0, inserted: 0, updated: 0 }
    );
    return NextResponse.json({ ok: true, totals, results });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
