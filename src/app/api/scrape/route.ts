import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { scrapeAllAccounts } from "@/lib/scrape";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // allow long-running scrapes

function toNdjsonLine(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

/**
 * Manually trigger a scrape and stream live progress updates back to the UI.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorizedRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (value: unknown) => controller.enqueue(toNdjsonLine(value));

      void (async () => {
        try {
          send({ type: "status", message: "Scrape started" });
          const results = await scrapeAllAccounts((event) => {
            send({ type: "progress", ...event });
          });

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

          send({ type: "done", totals, results });
        } catch (err) {
          send({
            type: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
