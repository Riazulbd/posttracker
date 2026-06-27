"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScrapeJobStatus } from "@/lib/scrape-job";

function normalizeKeyword(value: string): string {
  return value.trim();
}

function dedupeKeywords(values: string[]): string[] {
  return [
    ...new Map(
      values
        .map(normalizeKeyword)
        .filter(Boolean)
        .map((value) => [
          value.toLowerCase().replace(/[^a-z0-9]/g, ""),
          value,
        ] as const)
    ).values(),
  ];
}

export function ScrapeControls({
  initialKeywords,
  initialStatus,
  authToken,
}: {
  initialKeywords: string[];
  initialStatus: ScrapeJobStatus;
  authToken: string | null;
}) {
  const router = useRouter();
  const [keywords, setKeywords] = useState(initialKeywords);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState(
    initialStatus.state === "running" ? "Scrape is running." : "Ready to scrape."
  );
  const [error, setError] = useState<string | null>(initialStatus.error);
  const [saved, setSaved] = useState<string | null>(null);

  const authHeaders: HeadersInit = useMemo(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authToken) headers["x-dashboard-token"] = authToken;
    return headers;
  }, [authToken]);

  const running = status.state === "running";
  const progress =
    status.total > 0 ? Math.min(100, (status.current / status.total) * 100) : 0;

  const progressLabel = useMemo(() => {
    if (running && status.total > 0) {
      return `${status.current} / ${status.total} accounts`;
    }
    if (running) return "Starting...";
    if (status.total > 0) return `${status.total} accounts processed`;
    return "No scrape yet";
  }, [running, status.current, status.total]);

  const statusLine = useMemo(() => {
    if (running && status.account) return `Scraping ${status.account}...`;
    if (running) return "Scrape is running.";
    if (status.state === "done") {
      return `Done: ${status.scanned} scanned, ${status.matched} matched, ${status.inserted} inserted, ${status.updated} updated.`;
    }
    if (status.state === "error") return status.error ?? "Scrape finished with errors.";
    return message;
  }, [message, running, status]);

  async function fetchScrapeStatus(): Promise<ScrapeJobStatus> {
    const response = await fetch("/api/scrape", {
      method: "GET",
      headers: authHeaders,
      cache: "no-store",
    });
    const data = (await response.json()) as
      | { ok: true; status: ScrapeJobStatus }
      | { ok: false; error?: string };

    if (!response.ok || !data.ok) {
      const responseError =
        "error" in data && data.error
          ? data.error
          : `Scrape status failed with status ${response.status}`;
      throw new Error(responseError);
    }

    return data.status;
  }

  useEffect(() => {
    if (!running) return;

    let stopped = false;
    let previousKey = `${status.current}:${status.inserted}:${status.updated}:${status.matched}`;

    const poll = async () => {
      try {
        const nextStatus = await fetchScrapeStatus();
        if (stopped) return;

        const nextKey = `${nextStatus.current}:${nextStatus.inserted}:${nextStatus.updated}:${nextStatus.matched}`;
        setStatus(nextStatus);
        if (nextKey !== previousKey || nextStatus.state !== "running") {
          previousKey = nextKey;
          router.refresh();
        }
        if (nextStatus.error) setError(nextStatus.error);
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : String(err));
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 2500);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [
    running,
    router,
    status.current,
    status.inserted,
    status.matched,
    status.updated,
  ]);

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
        "error" in data && data.error
          ? data.error
          : `Failed to save keywords (${response.status})`;
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
    setError(null);
    setSaved(null);
    setMessage("Starting scrape...");

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: authHeaders,
      });
      const data = (await response.json()) as
        | { ok: true; status: ScrapeJobStatus }
        | { ok: false; error?: string };

      if (!response.ok || !data.ok) {
        const responseError =
          "error" in data && data.error
            ? data.error
            : `Scrape request failed with status ${response.status}`;
        throw new Error(responseError);
      }

      setStatus(data.status);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessage("Scrape failed.");
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
          {running ? "Scraping..." : "Scrape now"}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{statusLine}</span>
          <span>{progressLabel}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${running || status.state === "done" ? progress : 0}%` }}
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
                  x
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
