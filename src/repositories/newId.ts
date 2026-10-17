// Lowercase base-36 time + random part, so it always matches ID_PATTERN.
export function newId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random}`;
}
