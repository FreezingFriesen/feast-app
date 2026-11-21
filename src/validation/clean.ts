// src/validation/clean.ts
// Remove control characters, invisible characters, and trim whitespace.
// normalizes text before it is checked.

export function cleanText(input: string): string {
  return input
    // NFC makes accented letters consistent: "é" typed two different ways becomes one.
    .normalize("NFC")
    // remove control characters (keeps newline, carriage return, tab)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    // remove invisible/direction-override characters used for spoofing
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .trim();
}

// A name as a matching key: cleaned, lower-cased, runs of spaces made one. Used to merge
// grocery rows and to match recipe rows to the ingredient catalog, so both agree on what
// "the same name" means. Accents stay (NFC only makes them consistent), and there is no
// guessing about plurals: "Egg" and "Eggs" are different keys, because a wrong match is
// worse than a missed one.
export function normaliseName(name: string): string {
  // Fast path, same result: printable ASCII whose only whitespace is the space is already
  // NFC and has no control or invisible characters, so cleanText would only trim it. Most
  // names are like this, and the ingredient catalog normalises thousands of them at once.
  if (PLAIN_ASCII.test(name)) {
    const lower = name.trim().toLowerCase();
    return lower.includes("  ") ? lower.replace(/ {2,}/g, " ") : lower;
  }
  return cleanText(name).toLowerCase().replace(/\s+/g, " ");
}

// Printable ASCII and the space, nothing else.
const PLAIN_ASCII = /^[\x20-\x7E]*$/;