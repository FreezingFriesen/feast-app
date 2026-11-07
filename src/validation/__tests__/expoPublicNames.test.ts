/// <reference types="node" />
// EXPO_PUBLIC_ values are built into the app, where anyone can read them. So the list of
// names is fixed here, and a new one has to be added on purpose, never by accident.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ALLOWED_NAMES = [
  "EXPO_PUBLIC_BACKEND",
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
];

const REPO_ROOT = join(__dirname, "../../..");
const SKIPPED_FOLDERS = new Set(["node_modules", ".git", ".expo", "dist", "web-build", "ios", "android", "assets", ".vscode"]);
const SKIPPED_FILES = new Set(["package-lock.json"]);
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/;

// Code and config files. The real .env files are never opened: only the example is read.
function codeFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return SKIPPED_FOLDERS.has(entry.name) ? [] : codeFiles(path);
    if (SKIPPED_FILES.has(entry.name)) return [];
    return entry.name === ".env.example" || CODE_FILE.test(entry.name) ? [path] : [];
  });
}

// Every full name, with the files it appears in. A mention of just the start of a name
// in a comment ("the EXPO_PUBLIC_FIREBASE_ variables") ends in _ and doesn't count.
function namesInCode(): Map<string, string[]> {
  const names = new Map<string, string[]>();
  for (const path of codeFiles(REPO_ROOT)) {
    const matches = readFileSync(path, "utf8").match(/EXPO_PUBLIC_[A-Z0-9_]+/g) ?? [];
    for (const name of new Set(matches)) {
      if (name.endsWith("_")) continue;
      names.set(name, [...(names.get(name) ?? []), relative(REPO_ROOT, path)]);
    }
  }
  return names;
}

describe("EXPO_PUBLIC_ variables", () => {
  const names = namesInCode();

  it("uses only the seven known names", () => {
    const unexpected = [...names]
      .filter(([name]) => !ALLOWED_NAMES.includes(name))
      .map(([name, files]) => `${name} in ${files.join(", ")}`);
    expect(unexpected).toEqual([]);
  });

  it("finds all seven, so the scan itself is working", () => {
    expect([...names.keys()].sort()).toEqual(ALLOWED_NAMES);
  });

  it("lists all seven in .env.example, with empty values", () => {
    const lines = readFileSync(join(REPO_ROOT, ".env.example"), "utf8")
      .split(/\r?\n/)
      .filter((line) => line.startsWith("EXPO_PUBLIC_"));
    expect(lines.sort()).toEqual(ALLOWED_NAMES.map((name) => `${name}=`));
  });
});
