// Lowercase base-36 time + random part, so it always matches ID_PATTERN.
// e.g. "mh2k9x1c-4f7q0z2a". Base 36 uses only 0-9 and a-z.
export function newId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random}`;
}
