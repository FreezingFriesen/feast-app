// The exact shape of synced documents, copied from firestore.rules (validRecipe and
// validMealPlanEntry). The Rules accept only these keys (hasOnly/hasAll), so uploads are
// built from these lists and never by spreading a local object. Change them together.
import type { RemoteCollection } from "./RemoteContentStore";

type DocumentKeys = { required: readonly string[]; optional: readonly string[] };

export const REMOTE_DOCUMENT_KEYS: Record<RemoteCollection, DocumentKeys> = {
  recipes: {
    required: ["title", "servings", "mealTypes", "ingredients", "steps", "dietTags", "createdAt", "updatedAt", "schemaVersion"],
    optional: ["description", "prepTimeMinutes", "cookTimeMinutes", "notes", "allergens", "deletedAt"],
  },
  mealPlanEntries: {
    required: ["date", "mealType", "recipeId", "servings", "createdAt", "updatedAt", "schemaVersion"],
    optional: ["deletedAt"],
  },
};

// The keys of one ingredient row. The Rules can't check inside lists, but our schema
// does, and other devices validate downloads with it.
const INGREDIENT_ROW_KEYS = ["ingredientId", "name", "quantity", "unit", "note"] as const;

// Copies only the listed keys whose value is set (Firestore refuses undefined).
function pick(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

// The document to upload for a validated stored record: only the keys the Rules allow,
// with no ID (that is the document ID), no local-only fields and no undefined values.
export function toRemoteDocument(collection: RemoteCollection, data: Record<string, unknown>): Record<string, unknown> {
  const { required, optional } = REMOTE_DOCUMENT_KEYS[collection];
  const document = pick(data, [...required, ...optional]);
  if (collection === "recipes" && Array.isArray(document.ingredients)) {
    document.ingredients = document.ingredients.map((row) => pick(row as Record<string, unknown>, INGREDIENT_ROW_KEYS));
  }
  return document;
}

// True if the document has exactly the keys the Rules allow: every required key, and no
// key that isn't listed.
export function hasAllowedKeys(collection: RemoteCollection, document: Record<string, unknown>): boolean {
  const { required, optional } = REMOTE_DOCUMENT_KEYS[collection];
  const keys = Object.keys(document);
  return required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key));
}
