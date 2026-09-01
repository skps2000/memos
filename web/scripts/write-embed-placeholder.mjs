import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The Go binary embeds server/router/frontend/dist with `//go:embed dist/*`, which fails to
// compile when that directory holds nothing. One tracked file has to live there so a fresh
// clone can `go build ./cmd/memos` without building the frontend first.
//
// It cannot be index.html: `vite build --emptyOutDir` wipes the directory and then writes its
// own index.html, so a tracked index.html shows up modified after every release and invites
// somebody to commit one machine's build output. This file uses a name the build never emits,
// and the release script rewrites it once the build has finished emptying the directory —
// so the working tree stays clean.
//
// Kept byte-identical to the tracked copy by tests/embed-placeholder.test.ts.
export const EMBED_PLACEHOLDER_FILENAME = "placeholder.html";

export const EMBED_PLACEHOLDER_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Memos</title>
  </head>
  <body>
    No embeddable frontend found. Build it with \`cd web && pnpm release\`, then rebuild the binary.
  </body>
</html>
`;

export const embedPlaceholderPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "server",
  "router",
  "frontend",
  "dist",
  EMBED_PLACEHOLDER_FILENAME,
);

const writeEmbedPlaceholder = async () => {
  await mkdir(dirname(embedPlaceholderPath), { recursive: true });
  await writeFile(embedPlaceholderPath, EMBED_PLACEHOLDER_HTML, "utf8");
};

// Only write when run as a script, so the constants can be imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await writeEmbedPlaceholder();
}

export default writeEmbedPlaceholder;
