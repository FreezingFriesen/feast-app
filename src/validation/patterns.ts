// src/validation/patterns.ts
// Allowlists: describe what IS permitted.

// Short names: letters (any language), numbers, spaces, common punctuation
export const NAME_PATTERN = /^[\p{L}\p{M}\p{N} .,'’&()\-!/%+]+$/u;

// Usernames: lowercase letters, numbers, underscore
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

// IDs used in database paths: no slashes, spaces or quotes
export const ID_PATTERN = /^[a-z0-9_-]{1,100}$/;

// Calendar dates as "YYYY-MM-DD" (ASCII digits only)
export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;