// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The browser preview of PlotForge (`npm run web`), or the desktop app with live rebuilds (`npm run dev`).
import { readFileSync } from "node:fs";
import electron from "electron";
import { startForgePreview } from "forge-shell/scripts/web";
import { startServer } from "./serve.mjs";

const config = JSON.parse(readFileSync("forge.config.json", "utf8"));
await startForgePreview({
  productName: config.identity.name,
  desktop: process.argv.includes("--desktop"),
  electronPath: electron,
  startServer,
  watchPaths: ["source", "public", "documentation", "scripts", "VERSION", "forge.config.json", "package.json", "tsconfig.json", "LICENSE", "NOTICE.md", "README.md", "CHANGELOG.md"],
});
