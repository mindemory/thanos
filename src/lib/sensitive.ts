// What Thanos asks about twice before keeping: things that open accounts or move money. Everyone
// in a lab can read its cards, including people who join years from now, so a card should say
// who holds the card or the password and how to ask them, not the number itself.
//
// No imports, so `node --test` can run its test file as is.

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * A run of digits that could be a payment card: 13 to 19 of them, written together or in the
 * groups cards use (4-4-4-4, Amex's 4-6-5). Chart strings and grant numbers use other groupings,
 * so they pass; a card number must also start like one and pass the Luhn check.
 */
function looksLikeCard(run: string): boolean {
  const digits = run.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19 || !/^[3-6]/.test(digits) || !luhn(digits)) return false;
  const groups = run.split(/[ -]/).map((g) => g.length);
  if (groups.length === 1) return true;
  const fours = groups.slice(0, -1).every((n) => n === 4) && groups[groups.length - 1] <= 4;
  const amex = groups.length === 3 && groups[0] === 4 && groups[1] === 6 && groups[2] === 5;
  return fours || amex;
}

/** Plain descriptions of each kind of secret in the text, such as "a card number". */
export function findSensitive(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\b\d(?:[ -]?\d){12,18}\b/g)) {
    if (looksLikeCard(m[0])) found.add("a card number");
  }
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) found.add("a Social Security number");
  if (/\b(?:cvv|cvc|security code)\b\W{0,3}(?:is\s+)?\d{3,4}\b/i.test(text)) found.add("a card security code");
  if (/\b(?:password|passwd|passcode|pwd)\b\s*(?:is\b|:|=)\s*\S{4,}/i.test(text)) found.add("a password");
  if (
    /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(
      text,
    )
  ) {
    found.add("an API key or token");
  }
  if (/\b(?:routing|account|acct)\s*(?:number|no\.?|#)\s*(?:(?:is\b|:)\s*)?\d{6,17}\b/i.test(text)) found.add("a bank account number");
  return [...found];
}
