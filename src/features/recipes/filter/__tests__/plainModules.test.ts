/// <reference types="node" />
// The recipe filter's rules are plain TypeScript: no React Native, no Expo, no components.
// That keeps them testable without rendering, and lets the Firebase emulator check (plain
// Node) use them. This walks each module's runtime imports (type-only imports are erased,
// so they don't count) and fails on any package other than zod, or any .tsx file.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const SRC = resolve(__dirname, "../../../..");
const ALLOWED_PACKAGES = new Set(["zod"]);

// `import … from "x"` and `export … from "x"`, with what's imported. Multi-line braces included.
const FROM_IMPORT = /^(?:import|export)\s+(type\s+)?(\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s+["']([^"']+)["']/gm;
// `import "x";` (side effects only).
const BARE_IMPORT = /^import\s+["']([^"']+)["']/gm;

function resolveFile(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else return null;
  for (const ending of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(base + ending)) return base + ending;
  }
  throw new Error(`Can't resolve ${specifier} from ${relative(SRC, from)}`);
}

// The import chain to the first thing that isn't plain TypeScript, or null if there is none.
function firstNonPlainImport(entry: string): string | null {
  const seen = new Set<string>();
  const visit = (file: string, chain: string[]): string | null => {
    if (seen.has(file)) return null;
    seen.add(file);
    const here = [...chain, relative(SRC, file).replace(/\\/g, "/")];
    if (file.endsWith(".tsx")) return here.join(" → ");
    const source = readFileSync(file, "utf8");
    const specifiers = [
      ...[...source.matchAll(FROM_IMPORT)].filter((match) => match[1] === undefined).map((match) => match[3]),
      ...[...source.matchAll(BARE_IMPORT)].map((match) => match[1]),
    ];
    for (const specifier of specifiers) {
      const target = resolveFile(file, specifier);
      if (target === null) {
        if (!ALLOWED_PACKAGES.has(specifier)) return [...here, specifier].join(" → ");
        continue;
      }
      const found = visit(target, here);
      if (found !== null) return found;
    }
    return null;
  };
  return visit(entry, []);
}

const FILTER_MODULES = [
  "features/recipes/filter/allergenAssessment.ts",
  "features/recipes/filter/assessmentMemo.ts",
  "features/recipes/filter/dietConflicts.ts",
  "features/recipes/filter/recipeFilter.ts",
  "features/recipes/filter/recipeListState.ts",
  "features/recipes/filter/recipeSort.ts",
  "testing/recipeFilterTestBed.ts",
];

describe("the recipe filter modules are plain TypeScript", () => {
  it.each(FILTER_MODULES)("%s imports no React Native, Expo or component", (path) => {
    expect(firstNonPlainImport(join(SRC, path))).toBeNull();
  });

  it("the check itself catches a module that does (ChipSelect)", () => {
    expect(firstNonPlainImport(join(SRC, "components/form/ChipSelect.tsx"))).toBe("components/form/ChipSelect.tsx");
    expect(firstNonPlainImport(join(SRC, "features/recipes/useFilteredRecipes.ts"))).toMatch(/react|expo|\.tsx/);
  });
});
