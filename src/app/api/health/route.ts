import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** For an uptime monitor: whether the page and its database answer. It says nothing about any lab. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await (await db()).query("select 1");
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
