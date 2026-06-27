import { scrapeAllAccounts, type ScrapeProgressEvent } from "./scrape";
import type { ScrapeResult } from "./types";

export type ScrapeJobState = "idle" | "running" | "done" | "error";

export interface ScrapeJobStatus {
  state: ScrapeJobState;
  startedAt: string | null;
  finishedAt: string | null;
  current: number;
  total: number;
  account: string | null;
  scanned: number;
  matched: number;
  inserted: number;
  updated: number;
  error: string | null;
  results: ScrapeResult[];
}

type GlobalWithScrapeJob = typeof globalThis & {
  __postTrackerScrapeJob?: ScrapeJobStatus;
};

function emptyStatus(): ScrapeJobStatus {
  return {
    state: "idle",
    startedAt: null,
    finishedAt: null,
    current: 0,
    total: 0,
    account: null,
    scanned: 0,
    matched: 0,
    inserted: 0,
    updated: 0,
    error: null,
    results: [],
  };
}

function statusRef(): ScrapeJobStatus {
  const globalStore = globalThis as GlobalWithScrapeJob;
  if (!globalStore.__postTrackerScrapeJob) {
    globalStore.__postTrackerScrapeJob = emptyStatus();
  }
  return globalStore.__postTrackerScrapeJob;
}

function snapshot(status: ScrapeJobStatus): ScrapeJobStatus {
  return {
    ...status,
    results: [...status.results],
  };
}

function applyProgress(status: ScrapeJobStatus, event: ScrapeProgressEvent) {
  const previous = status.results.find((result) => result.account === event.account);
  status.current = event.current;
  status.total = event.total;
  status.account = event.account || status.account;

  if (previous) {
    status.scanned -= previous.scanned;
    status.matched -= previous.matched;
    status.inserted -= previous.inserted;
    status.updated -= previous.updated;
  }

  if (event.account) {
    const nextResult: ScrapeResult = {
      account: event.account,
      platform: event.platform,
      scanned: event.scanned,
      matched: event.matched,
      inserted: event.inserted,
      updated: event.updated,
      error: event.error,
    };
    status.results = [
      ...status.results.filter((result) => result.account !== event.account),
      nextResult,
    ];
    status.scanned += event.scanned;
    status.matched += event.matched;
    status.inserted += event.inserted;
    status.updated += event.updated;
  }

  if (event.error) {
    status.error = event.error;
  }
}

export function getScrapeJobStatus(): ScrapeJobStatus {
  return snapshot(statusRef());
}

export function startScrapeJob(): ScrapeJobStatus {
  const status = statusRef();
  if (status.state === "running") return snapshot(status);

  Object.assign(status, emptyStatus(), {
    state: "running",
    startedAt: new Date().toISOString(),
  } satisfies Partial<ScrapeJobStatus>);

  void (async () => {
    try {
      const results = await scrapeAllAccounts((event) => applyProgress(status, event));
      status.results = results;
      status.scanned = results.reduce((sum, result) => sum + result.scanned, 0);
      status.matched = results.reduce((sum, result) => sum + result.matched, 0);
      status.inserted = results.reduce((sum, result) => sum + result.inserted, 0);
      status.updated = results.reduce((sum, result) => sum + result.updated, 0);
      status.current = status.total || results.length;
      status.total = status.total || results.length;
      status.state = results.some((result) => result.error) ? "error" : "done";
      status.error =
        results.find((result) => result.error)?.error ??
        (status.state === "error" ? "One or more accounts failed to scrape." : null);
    } catch (err) {
      status.state = "error";
      status.error = err instanceof Error ? err.message : String(err);
    } finally {
      status.finishedAt = new Date().toISOString();
    }
  })();

  return snapshot(status);
}
