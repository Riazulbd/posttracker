"use client";

import { useMemo, useState } from "react";

type ScrapeTotals = {
  scanned: number;
  matched: number;
  inserted: number;
  updated: number;
};

type StreamEvent =
  | { type: "status"; message: string }
  | {
      type: "progress";
      current: number;
      total: number;
      account: string;
      platform: string;
      scanned: number;
      matched: number;
      inserted: number;
      updated: number;
      error?: string;
    }
  | { type: "done"; totals: ScrapeTotals; results: unknown[] }
  | { type: "error"; error: string };

function normalizeKeyword(value: string): string {
  return value.trim();
}

function dedupeKeywords(values: string[]): string[] {
  return [
    ...new Map(
      values
        .map(normalizeKeyword)
        .filter(Boolean)
        .map((value) => [value.toLowerCase().replace(/[^a-z0-9]/g, ""), value] as const)
    ).values(),
  ];
}

async function readNdjson(
  response: Response,
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  if (!response.body) {
    throw new Error("Scrape response did not include a stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      onEvent(JSON.parse(line) as StreamEvent);
    }

    if (done) break;
  }

  if (buffer.trim()) {
    onEvent(JSON.parse(buffer) as StreamEvent);
  }
}

export function ScrapeControls({
  initialKeywords,
  authToken,
}: {
  initialKeywords: string[];
  authToken: string | null;
}) {
  const [keywords, setKeywords] = useState(initialKeywords);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("Ready to scrape.");
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const authHeaders: HeadersInit = authToken
    ? { "Content-Type": "application/json", "x-dashboard-token": authToken }
    : { "Content-Type": "application/json" };

  const progressLabel = useMemo(() => {
    if (running && total > 0) {
      return `${Math.min(total, Math.round((progress / 100) * total))} / ${total} accounts`;
    }
    if (running) return "Starting…";
    if (total > 0) return `${total} accounts processed`;
    return "No scrape yet";
  }, [progress, running, total]);

  async function saveKeywords(nextKeywords: string[]) {
    setError(null);
    setSaved(null);

    const response = await fetch("/api/keywords", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ keywords: nextKeywords }),
    });

    const data = (await response.json()) as
      | { ok: true; keywords: string[] }
      | { ok: false; error?: string };

    if (!response.ok || !data.ok) {
      const message =
        !response.ok
          ? `Failed to save keywords (${response.status})`
          : "error" in data && data.error
            ? data.error
            : "Save failed";
      throw new Error(message);
    }

    setKeywords(data.keywords);
    setSaved("Keywords saved.");
  }

  async function onSave() {
    try {
      await saveKeywords(dedupeKeywords([...keywords, draft]));
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onScrape() {
    setRunning(true);
    setProgress(0);
    setTotal(0);
    setError(null);
    setSaved(null);
    setStatus("Starting scrape…");

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: authHeaders,
      });

      if (!response.ok) {
        throw new Error(`Scrape request failed with status ${response.status}`);
      }

      await readNdjson(response, (event) => {
        if (event.type === "status") {
          setStatus(event.message);
        } else if (event.type === "progress") {
          setTotal(event.total);
          const pct = event.total > 0 ? (event.current / event.total) * 100 : 0;
          setProgress(Math.min(100, Math.max(0, pct)));
          setStatus(
            event.error
              ? `${event.account} finished with an error`
              : `${event.account} (${event.current}/${event.total})`
          );
          if (event.error) {
            setError(event.error);
          }
        } else if (event.type === "done") {
          setProgress(100);
          setStatus(
            `Done: ${event.totals.scanned} scanned, ${event.totals.matched} matched, ${event.totals.inserted} inserted, ${event.totals.updated} updated.`
          );
        } else if (event.type === "error") {
          throw new Error(event.error);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("Scrape failed.");
    } finally {
      setRunning(false);
    }
  }

  function addKeyword() {
    const value = normalizeKeyword(draft);
    if (!value) return;
    setKeywords((current) => dedupeKeywords([...current, value]));
    setDraft("");
  }

  function removeKeyword(keyword: string) {
    setKeywords((current) => current.filter((item) => item !== keyword));
  }

  return (
    <section className="w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:max-w-[520px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Scrape controls</h2>
          <p className="mt-1 text-xs text-slate-500">
            Run a live scrape and manage your tracked keywords in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={onScrape}
          disabled={running}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? "Scraping…" : "Scrape now"}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{status}</span>
          <span>{progressLabel}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${running || progress === 100 ? progress : 0}%` }}
          />
        </div>
      </div>

      <div className="mt-5">
        <label className="text-xs font-medium text-slate-600">Tracked keywords</label>
        <div className="mt-2 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addKeyword();
              }
            }}
            placeholder="Add a keyword or handle"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
          <button
            type="button"
            onClick={addKeyword}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Add
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {keywords.length === 0 ? (
            <span className="text-xs text-slate-500">
              No keywords saved yet. Add at least one to filter matching posts.
            </span>
          ) : (
            keywords.map((keyword) => (
              <span
                key={keyword}
                className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
              >
                {keyword}
                <button
                  type="button"
                  onClick={() => removeKeyword(keyword)}
                  className="text-slate-400 hover:text-slate-700"
                  aria-label={`Remove ${keyword}`}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Save keywords
          </button>
          {saved ? <span className="text-xs text-emerald-600">{saved}</span> : null}
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
