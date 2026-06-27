import { ApifyClient } from "apify-client";
import { env } from "./env";
import type { Platform } from "./types";

let client: ApifyClient | null = null;

function getClient(): ApifyClient {
  if (!client) client = new ApifyClient({ token: env.apifyToken });
  return client;
}

/**
 * Run an Apify actor to completion and return its dataset items.
 * Throws if the run fails so the caller can record the error per-account.
 */
export async function runActor(
  actorId: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const run = await getClient().actor(actorId).call(input);
  if (!run.defaultDatasetId) return [];
  const { items } = await getClient()
    .dataset(run.defaultDatasetId)
    .listItems();
  return items as Record<string, unknown>[];
}

/**
 * Fetch an Instagram account's follower count via the profile scraper.
 * The post scraper does not return follower counts, so we look them up here
 * and use them when computing engagement rate. Returns null on any failure.
 */
export async function fetchInstagramFollowers(
  username: string
): Promise<number | null> {
  try {
    const items = await runActor(env.instagramProfileActor, {
      usernames: [username],
    });
    const profile = items[0] as Record<string, unknown> | undefined;
    if (!profile) return null;
    const followers =
      profile.followersCount ??
      profile.followers ??
      (profile.userInfo as Record<string, unknown> | undefined)?.followersCount;
    const n = Number(followers);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Build the actor input for an account. These inputs target the default
 * actors (apify/instagram-post-scraper, clockworks/tiktok-scraper, and
 * apify/facebook-posts-scraper). If you swap actors, adjust the input shape here and the field mapping in
 * mappers.ts.
 */
export function buildActorInput(
  platform: Platform,
  username: string
): { actorId: string; input: Record<string, unknown> } {
  const limit = env.resultsLimit;

  if (platform === "instagram") {
    // Default actor: apify/instagram-post-scraper, which takes a list of
    // usernames and returns their recent posts.
    return {
      actorId: env.instagramActor,
      input: {
        username: [username],
        resultsLimit: limit,
      },
    };
  }

  if (platform === "facebook") {
    return {
      actorId: env.facebookActor,
      input: {
        captionText: false,
        resultsLimit: env.facebookResultsLimit,
        startUrls: [{ url: username }],
      },
    };
  }

  return {
    actorId: env.tiktokActor,
    input: {
      profiles: [username],
      resultsPerPage: limit,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    },
  };
}
