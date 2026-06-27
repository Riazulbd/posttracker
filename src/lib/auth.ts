import { NextRequest } from "next/server";
import crypto from "crypto";
import { env } from "./env";

const DASHBOARD_TOKEN_TTL_MS = 10 * 60 * 1000;

function matchesBasicAuth(header: string): boolean {
  if (!env.dashboardUser || !env.dashboardPassword) return false;
  if (!header.startsWith("Basic ")) return false;

  const decoded = atob(header.slice(6));
  const idx = decoded.indexOf(":");
  if (idx < 0) return false;

  const user = decoded.slice(0, idx);
  const password = decoded.slice(idx + 1);
  return user === env.dashboardUser && password === env.dashboardPassword;
}

function matchesBearerToken(header: string): boolean {
  if (!env.cronSecret) return false;
  if (!header.startsWith("Bearer ")) return false;
  return header.slice(7) === env.cronSecret;
}

function matchesDashboardToken(token: string): boolean {
  if (!env.cronSecret) return false;

  const [timestamp, signature] = token.split(".");
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;

  const age = Date.now() - Number(timestamp);
  if (age < 0 || age > DASHBOARD_TOKEN_TTL_MS) return false;

  const expected = crypto
    .createHmac("sha256", env.cronSecret)
    .update(timestamp)
    .digest("hex");
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function createDashboardToken(): string | null {
  if (!env.cronSecret) return null;
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", env.cronSecret)
    .update(timestamp)
    .digest("hex");
  return `${timestamp}.${signature}`;
}

/**
 * Shared auth helper for dashboard-triggered API routes.
 *
 * If no auth is configured, requests are allowed so local/dev setups still work.
 */
export function isAuthorizedRequest(req: NextRequest): boolean {
  const hasAuthConfig = Boolean(
    env.cronSecret || (env.dashboardUser && env.dashboardPassword)
  );
  if (!hasAuthConfig) return true;

  const header = req.headers.get("authorization") ?? "";
  const dashboardToken = req.headers.get("x-dashboard-token") ?? "";
  return (
    matchesBasicAuth(header) ||
    matchesBearerToken(header) ||
    matchesDashboardToken(dashboardToken)
  );
}
