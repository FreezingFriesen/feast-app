/// <reference types="node" />
// Runs the real import command (scripts/importIngredients.ts --write) against the Firestore
// emulator, the same code path as a real import. emulators:exec has already set
// FIRESTORE_EMULATOR_HOST, and no credentials from the person's own machine can be picked up.
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

export const REPO_ROOT = resolve(__dirname, "../../..");

export function runIngredientImport(csvPath: string, extraEnv: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  if (!("GOOGLE_APPLICATION_CREDENTIALS" in extraEnv)) delete env.GOOGLE_APPLICATION_CREDENTIALS;
  return spawnSync(
    process.execPath,
    [join(REPO_ROOT, "node_modules/tsx/dist/cli.mjs"), "scripts/importIngredients.ts", csvPath, "--write"],
    { cwd: REPO_ROOT, env, encoding: "utf8" },
  );
}
