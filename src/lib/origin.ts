import { headers } from "next/headers";

import { isLocal } from "./db";

/**
 * The address links in emails and invites point to. A hosted Thanos takes it from THANOS_URL,
 * or from Vercel's production address. Only a local copy trusts the request's Host header: on a
 * server, a forged one would send someone's sign-in link to another site.
 */
export async function siteOrigin(): Promise<string | null> {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const set = process.env.THANOS_URL || (vercel ? `https://${vercel}` : null);
  if (set) return set.replace(/\/+$/, "");
  if (!isLocal) return null;
  return `http://${(await headers()).get("host") ?? "127.0.0.1:4848"}`;
}

/** A local copy opened from this computer, where a sign-in link can be shown on the page itself. */
export async function onThisComputer(): Promise<boolean> {
  if (!isLocal) return false;
  const host = ((await headers()).get("host") ?? "").replace(/:\d+$/, "");
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}
