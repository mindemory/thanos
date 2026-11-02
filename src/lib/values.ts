// Values someone copies out of an answer mid-task, caught even when nobody put them in backticks:
// chart strings and other long account numbers, file paths, and the addresses of shared drives.
// Answers set them in mono with a copy button beside them, the same as `code`.
//
// No @/ imports, so `node --test` can run it as is.

// Four or more groups of digits joined by hyphens: a chart string, not a date or a phone number.
const CHART = String.raw`\b\d+(?:-\d+){3,}\b`;
// One part of a path. It may start with a dot (.thanos) but doesn't end with one, so the full
// stop after "the data is in /lab/raw." stays out of it.
const PART = String.raw`\.?[\w@%+-](?:[\w.@%+-]*[\w@%+-])?`;
// ~/projects, or /lab/raw with at least two parts, so "/murray" and "and/or" aren't paths.
const PATH = String.raw`(?<![\w/.:~])(?:~\/${PART}(?:\/${PART})*|\/${PART}(?:\/${PART})+)\/?`;
// A shared drive: smb://files.example.edu/lab, or \\files\lab\raw on Windows.
const SHARE = String.raw`\b(?:smb|afp|nfs|sftp|ssh):\/\/[^\s<>()]*[^\s<>().,;:!?'"]`;
const UNC = String.raw`(?<!\S)\\\\[\w.$-]+(?:\\[\w.$-]+)+`;

/** Every kind of value as one pattern, with no capturing groups, to put inside a larger one. */
export const VALUE = [SHARE, PATH, UNC, CHART].join("|");

const WHOLE = new RegExp(`^(?:${VALUE})$`);

/** Whether a piece of text is a value. A chart string needs eight digits, so "1-2-3-4" isn't one. */
export function isValue(text: string): boolean {
  if (!WHOLE.test(text)) return false;
  return !/^[\d-]+$/.test(text) || text.replace(/-/g, "").length >= 8;
}

/** The values in a piece of text, in order. */
export function findValues(text: string): string[] {
  return (text.match(new RegExp(VALUE, "g")) ?? []).filter(isValue);
}
