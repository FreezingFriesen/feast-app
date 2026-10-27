// src/validation/authSchema.ts
// Accounts and sessions (N-13 to N-17): email, password, username, user IDs,
// and the session data read back from secure storage.
import { z } from "zod";
import { cleanText } from "./clean";
import { EMAIL_PATTERN, SECURE_KEY_PATTERN, UID_PATTERN, USERNAME_PATTERN } from "./patterns";

// Limits. Mirror the username and timestamp limits in the Firestore Security Rules.
export const MAX_EMAIL_LENGTH = 254;
export const MAX_EMAIL_LOCAL_PART_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 20;
export const MAX_UID_LENGTH = 128;
// Raw input longer than this is rejected before it is cleaned.
const MAX_RAW_INPUT_LENGTH = 1000;

// Epoch milliseconds for createdAt, updatedAt and login dates (shared helper).
// "Not far in the future" depends on the server clock, so that check is in the Security Rules.
export const MIN_TIMESTAMP_MS = Date.UTC(2020, 0, 1);
export const MAX_TIMESTAMP_MS = Date.UTC(2100, 11, 31, 23, 59, 59, 999);
export const timestampSchema = z.number().int().min(MIN_TIMESTAMP_MS).max(MAX_TIMESTAMP_MS);

// Firebase Auth user ID. Always taken from the auth session, never from route params.
export const uidSchema = z.string().max(MAX_UID_LENGTH).regex(UID_PATTERN);

// Cleaned and lowercased. ASCII only, so internationalized addresses are rejected.
export const emailSchema = z
  .string()
  .max(MAX_RAW_INPUT_LENGTH)
  .transform((value) => cleanText(value).toLowerCase())
  .pipe(
    z
      .string()
      .min(1)
      .max(MAX_EMAIL_LENGTH)
      .regex(EMAIL_PATTERN)
      // EMAIL_PATTERN allows exactly one "@", so its position is the local part's length.
      .refine((email) => email.indexOf("@") <= MAX_EMAIL_LOCAL_PART_LENGTH, "Email is too long"),
  );

// New passwords. Never cleaned or trimmed (that would change the password) and any
// character is allowed. Zod counts length in Unicode code points, so an emoji counts as 1.
export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);

// An existing password (log in, re-authentication). Only bounded, so the form gives no
// hints about the password rules and older accounts can still log in.
export const currentPasswordSchema = z.string().min(1).max(MAX_PASSWORD_LENGTH);

// Usernames typed by the user: cleaned, lowercased, then the allowlist.
export const usernameSchema = z
  .string()
  .max(MAX_RAW_INPUT_LENGTH)
  .transform((value) => cleanText(value).toLowerCase())
  .pipe(z.string().min(MIN_USERNAME_LENGTH).max(MAX_USERNAME_LENGTH).regex(USERNAME_PATTERN));

// Usernames read back from storage or sync must already be in canonical form.
export const storedUsernameSchema = z.string().max(MAX_USERNAME_LENGTH).regex(USERNAME_PATTERN);

// Forms

export const signUpFormSchema = z
  .object({
    email: emailSchema,
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string().max(MAX_PASSWORD_LENGTH),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .transform(({ email, username, password }) => ({ email, username, password }));

export const changePasswordFormSchema = z
  .object({
    currentPassword: currentPasswordSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string().max(MAX_PASSWORD_LENGTH),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ["newPassword"],
    message: "Choose a different password",
  })
  .transform(({ currentPassword, newPassword }) => ({ currentPassword, newPassword }));

// Account deletion (N-17): the current password, and the username typed out as a
// confirmation. Cleaned and lowercased like any username, then compared with the profile's.
export const deleteAccountSchema = z.object({ password: currentPasswordSchema, confirmation: usernameSchema });

// AuthService inputs (checked again inside the service, before calling the server)

// Choosing a username for an account whose sign up stopped before the username was saved.
export const chooseUsernameSchema = z.object({ username: usernameSchema });

export const newAccountSchema = z.object({ email: emailSchema, password: passwordSchema });
export const signInSchema = z.object({ email: emailSchema, password: currentPasswordSchema });
export const passwordResetSchema = z.object({ email: emailSchema });
export const reauthSchema = z.object({ password: currentPasswordSchema });
export const newPasswordSchema = z.object({ newPassword: passwordSchema });

// Session data read back from secure storage (untrusted like any other stored data)

export const SESSION_CHUNK_LENGTH = 600; // UTF-16 code units: at most 1800 UTF-8 bytes
export const MAX_SESSION_CHUNKS = 16;
export const MAX_SESSION_ITEMS = 8;
export const MAX_SESSION_ITEM_NAME_LENGTH = 160;

// The login date is stored as decimal digits.
export const storedLoginAtSchema = z
  .string()
  .max(20)
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(timestampSchema);

// Which A/B slot holds an item's chunks, how many there are, and the full value's length.
export const chunkManifestSchema = z.object({
  slot: z.enum(["a", "b"]),
  count: z.number().int().min(0).max(MAX_SESSION_CHUNKS),
  length: z.number().int().min(0).max(MAX_SESSION_CHUNKS * SESSION_CHUNK_LENGTH),
});

// The encoded names of the items in session storage, so clear() can find them all.
export const sessionItemIndexSchema = z
  .array(z.string().max(MAX_SESSION_ITEM_NAME_LENGTH).regex(SECURE_KEY_PATTERN))
  .max(MAX_SESSION_ITEMS);
