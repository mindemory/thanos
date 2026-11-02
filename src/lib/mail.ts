/**
 * Email through Resend's API, the one service Thanos needs besides a database. Without a key a
 * hosted Thanos can't send sign-in links; a local one shows them on the page instead.
 */
export function mailReady(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const reply = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.THANOS_MAIL_FROM || "Thanos <onboarding@resend.dev>", to: [to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    return reply.ok;
  } catch {
    return false;
  }
}
