/**
 * Small typed accessor for environment variables. Throws a clear error when a
 * required variable is missing so misconfiguration fails fast and loudly.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`
    );
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : fallback;
}

export const env = {
  // Supabase
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },

  // Apify
  get apifyToken() {
    return required("APIFY_TOKEN");
  },
  instagramActor: optional("APIFY_INSTAGRAM_ACTOR", "apify/instagram-post-scraper"),
  instagramProfileActor: optional(
    "APIFY_INSTAGRAM_PROFILE_ACTOR",
    "apify/instagram-profile-scraper"
  ),
  tiktokActor: optional("APIFY_TIKTOK_ACTOR", "clockworks/tiktok-scraper"),
  // Posts pulled per account per run. Apify charges per post (~$1.70/1000),
  // so keep this low — accounts rarely post >10 times between Mon and Fri.
  resultsLimit: Number(optional("APIFY_RESULTS_LIMIT", "10")) || 10,
  // The IG profile scraper is pricey (~$2.60/100 profiles). Only refresh an
  // account's follower count when the cached value is older than this many
  // days; otherwise reuse it. Set to 0 to refresh on every run.
  followerRefreshDays: Number(optional("FOLLOWER_REFRESH_DAYS", "7")) || 7,
  // Only keep posts whose caption/hashtags mention one of these keywords
  // (comma-separated, matched ignoring case/spaces/punctuation). Leave empty
  // to keep every post. Default tracks the current campaign keyword.
  trackKeywords: optional("TRACK_KEYWORDS", "ChildrensMNPartner")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Scheduling
  scrapeCron: optional("SCRAPE_CRON", "0 9 * * 1,5"),
  timezone: optional("TZ", "America/Chicago"),
  runOnBoot: optional("RUN_ON_BOOT", "false").toLowerCase() === "true",

  // Security
  cronSecret: optional("CRON_SECRET"),
  dashboardUser: optional("DASHBOARD_USER"),
  dashboardPassword: optional("DASHBOARD_PASSWORD"),
};
