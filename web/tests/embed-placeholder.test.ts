import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM build script, no type declarations.
import { EMBED_PLACEHOLDER_HTML, embedPlaceholderPath } from "../scripts/write-embed-placeholder.mjs";

// server/router/frontend/dist/placeholder.html is the one tracked file in an otherwise ignored
// build directory, and it exists only so `//go:embed dist/*` has something to embed in a fresh
// clone. `vite build --emptyOutDir` deletes it on every release and the release script writes it
// back, so the committed bytes and the bytes that script produces have to stay identical —
// otherwise every release would quietly dirty the working tree again, which is the whole thing
// this arrangement exists to prevent.
describe("embed placeholder", () => {
  it("matches the bytes the release script writes back after each build", () => {
    expect(readFileSync(embedPlaceholderPath, "utf8")).toBe(EMBED_PLACEHOLDER_HTML);
  });

  it("explains how to build the real frontend", () => {
    expect(EMBED_PLACEHOLDER_HTML).toContain("pnpm release");
  });
});
