import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let cached: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service-role key. This bypasses RLS,
 * so it must only ever run on the server (worker, API routes, server
 * components) — never ship the service-role key to the browser.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
