// src/validation/clean.ts
// Remove control characters, invisible characters, and trim whitespace.
// normalizes text before it is checked.

export function cleanText(input: string): string {
  return input
    .normalize("NFC")
    // remove control characters (keeps newline, carriage return, tab)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    // remove invisible/direction-override characters used for spoofing
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .trim();
}