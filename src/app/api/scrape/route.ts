import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { getScrapeJobStatus, startScrapeJob } from "@/lib/scrape-job";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isAuthorizedRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, status: await getScrapeJobStatus() });
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await startScrapeJob();
  return NextResponse.json(
    {
      ok: true,
      status,
      alreadyRunning: status.state === "running" && status.current > 0,
    },
    { status: 202 }
  );
}
