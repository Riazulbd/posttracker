import { ApifyClient } from "apify-client";
import { env } from "./env";
import type { Platform } from "./types";

let client: ApifyClient | null = null;

function getClient(): ApifyClient {
  if (!client) client = new ApifyClient({ token: env.apifyToken });
  return client;
}

export interface ActorRun {
  items: Record<string, unknown>[];
  /** Set when the run did not reach SUCCEEDED but still produced items. */
  warning?: string;
}

/**
 * Run an Apify actor and return its dataset items.
 *
 * A run that overruns `waitSecs` is *not* a failure: the actor keeps going on
 * Apify's side and its dataset usually already holds most of the results. We
 * therefore give it one extra wait, then fall back to whatever the dataset
 * contains rather than throwing away a whole account's posts. We only throw
 * when there is genuinely nothing to work with.
 */
export async function runActor(
  actorId: string,
  input: Record<string, unknown>
): Promise<ActorRun> {
  const apify = getClient();
  let run = await apify.actor(actorId).call(input, { waitSecs: env.actorWaitSecs });

  // Still going? Give it one more window before settling for partial data.
  if (run.status === "RUNNING" || run.status === "READY") {
    const waited = await apify
      .run(run.id)
      .waitForFinish({ waitSecs: env.actorWaitSecs });
    if (waited) run = waited;
  }

  const items = run.defaultDatasetId
    ? ((
        await apify.dataset(run.defaultDatasetId).listItems({
          // The client default page is large enough for the usual 25-post
          // window, but pin it so a smaller default cannot drop the tail.
          limit: Math.max(1000, env.resultsLimit, env.facebookResultsLimit),
        })
      ).items as Record<string, unknown>[])
    : [];

  if (run.status === "SUCCEEDED") return { items };

  if (items.length > 0) {
    return {
      items,
      warning:
        `Apify actor ${actorId} ended as ${run.status} after ` +
        `${env.actorWaitSecs * 2}s; used the ${items.length} result(s) it had produced.`,
    };
  }

  throw new Error(
    `Apify actor ${actorId} returned no results (status: ${run.status}). ` +
      `Check the run in the Apify console, or raise APIFY_ACTOR_WAIT_SECS.`
  );
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
    const { items } = await runActor(env.instagramProfileActor, {
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
 * apify/instagram-post-scraper accepts a handle, an @handle, or a profile URL
 * and collapses duplicates itself. Seed rows are plain handles; normalize so a
 * pasted "@name" or surrounding whitespace still resolves.
 */
function instagramTargets(username: string): string[] {
  const trimmed = username.trim();
  const handle = trimmed.replace(/^@+/, "");
  if (!handle) return [];
  if (/^https?:\/\//i.test(handle)) return [handle];
  return [handle, `https://www.instagram.com/${handle}/`];
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
    // Default actor: apify/instagram-post-scraper.
    // detailedData is what returns tagged users, collab coauthors, alt text,
    // carousel children, and the comment sample. basicData omits those, and
    // the actor's own examples pass basicData, so a run that follows the
    // example drops a campaign post that only *tags* the brand. Ask for
    // detailedData explicitly. It costs one extra post-details request per
    // post; both levels are still one saved row.
    return {
      actorId: env.instagramActor,
      input: {
        username: instagramTargets(username),
        resultsLimit: limit,
        dataDetailLevel: "detailedData",
      },
    };
  }

  if (platform === "facebook") {
    return {
      actorId: env.facebookActor,
      input: {
        // Keyword matching runs against the post text, so we must ask for it.
        // With this off the scraper returns posts with no caption and every
        // one of them silently fails the keyword filter.
        captionText: true,
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
