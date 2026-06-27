import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { getTrackedKeywords, replaceTrackedKeywords } from "@/lib/keywords";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAuthorizedRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { keywords?: unknown };
    const keywords = Array.isArray(body.keywords)
      ? body.keywords
          .map((keyword) => String(keyword).trim())
          .filter(Boolean)
      : [];
    const saved = await replaceTrackedKeywords(keywords);
    return NextResponse.json({ ok: true, keywords: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("Keyword storage is not initialized") ? 503 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status }
    );
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keywords = await getTrackedKeywords();
  return NextResponse.json({ ok: true, keywords });
}
