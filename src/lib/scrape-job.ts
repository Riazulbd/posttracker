import { scrapeAllAccounts, type ScrapeProgressEvent } from "./scrape";
import { getSupabaseAdmin } from "./supabase";
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

function finishCompletedRunningStatus(status: ScrapeJobStatus): ScrapeJobStatus {
  const hasError = Boolean(status.error) || status.results.some((result) => result.error);

  return {
    ...status,
    state: hasError ? "error" : "done",
    finishedAt: status.finishedAt ?? new Date().toISOString(),
    error:
      status.error ??
      (hasError ? "One or more accounts failed to scrape." : null),
  };
}

async function persistStatus(status: ScrapeJobStatus): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from("scrape_state")
      .upsert({
        id: "current",
        status,
        updated_at: new Date().toISOString(),
      });
  } catch {
    // The app can still show in-process progress if the optional table is absent.
  }
}

function coerceStatus(value: unknown): ScrapeJobStatus | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ScrapeJobStatus>;
  if (
    candidate.state !== "idle" &&
    candidate.state !== "running" &&
    candidate.state !== "done" &&
    candidate.state !== "error"
  ) {
    return null;
  }
  return {
    ...emptyStatus(),
    ...candidate,
    results: Array.isArray(candidate.results) ? candidate.results : [],
  };
}

async function readPersistedStatus(): Promise<ScrapeJobStatus | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("scrape_state")
      .select("status, updated_at")
      .eq("id", "current")
      .maybeSingle();
    if (error || !data) return null;

    const persisted = coerceStatus((data as { status?: unknown }).status);
    if (!persisted) return null;

    const updatedAt = new Date(String((data as { updated_at?: string }).updated_at));
    const staleMs = Date.now() - updatedAt.getTime();
    if (
      persisted.state === "running" &&
      persisted.total > 0 &&
      persisted.current >= persisted.total
    ) {
      const repaired = finishCompletedRunningStatus(persisted);
      void persistStatus(repaired);
      return repaired;
    }

    if (persisted.state === "running" && staleMs > 15 * 60 * 1000) {
      const stalled = {
        ...persisted,
        state: "error",
        finishedAt: new Date().toISOString(),
        error: "The previous scrape stopped reporting progress. Start a new scrape.",
      } satisfies ScrapeJobStatus;
      void persistStatus(stalled);
      return stalled;
    }

    return persisted;
  } catch {
    return null;
  }
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

export async function getScrapeJobStatus(): Promise<ScrapeJobStatus> {
  const memoryStatus = statusRef();
  if (memoryStatus.state === "running") return snapshot(memoryStatus);

  const persisted = await readPersistedStatus();
  return persisted ?? snapshot(memoryStatus);
}

export async function startScrapeJob(): Promise<ScrapeJobStatus> {
  const current = await getScrapeJobStatus();
  if (current.state === "running") return current;

  const status = statusRef();

  Object.assign(status, emptyStatus(), {
    state: "running",
    startedAt: new Date().toISOString(),
  } satisfies Partial<ScrapeJobStatus>);
  await persistStatus(snapshot(status));

  void (async () => {
    try {
      const results = await scrapeAllAccounts((event) => {
        applyProgress(status, event);
        void persistStatus(snapshot(status));
      });
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
      await persistStatus(snapshot(status));
    }
  })();

  return snapshot(status);
}
