const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 10": a day close enough that the year goes without saying. */
export function dayMonth(isoDate: string): string {
  const d = new Date(isoDate);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function monthYear(isoDate: string): string {
  const d = new Date(isoDate);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "today", "3 days ago", "2 weeks ago", then the month. Counted in days, so server and browser agree. */
export function ago(isoDate: string, now = Date.now()): string {
  const days = Math.floor((now - Date.parse(isoDate)) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return monthYear(isoDate);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
