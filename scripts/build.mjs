// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Build PlotForge into build/: the interface (build/app), the Electron main process and preload (build/desktop) and
// the engine (build/engine).
import { writeAppIdentity } from "forge-shell/scripts/app-identity";
import { buildForgeApp } from "forge-shell/scripts/build";

// The wordmark and icons are drawn by forge-shell from forge.config.json into build/identity.
const { logo } = writeAppIdentity();
await buildForgeApp({
  targets: [
    { entryPoints: ["source/app/main.ts"], outfile: "build/app/app.js", platform: "browser", format: "esm", define: { __APP_LOGO__: JSON.stringify(logo) } },
    { entryPoints: ["source/desktop/main.ts"], outfile: "build/desktop/main.cjs", platform: "node", format: "cjs", external: ["electron"] },
    { entryPoints: ["source/desktop/preload.ts"], outfile: "build/desktop/preload.cjs", platform: "node", format: "cjs", external: ["electron"] },
    { entryPoints: ["source/engine/index.ts"], outfile: "build/engine/index.cjs", platform: "node", format: "cjs" },
  ],
  staticFiles: [["LICENSE", "LICENSE"], ["NOTICE.md", "NOTICE.md"], ["CHANGELOG.md", "CHANGELOG.md"]],
  releaseDirs: ["source", "public", "scripts", "documentation"],
  releaseCopies: [{ from: "node_modules/forge-shell", to: "vendor/forge-shell" }],
  releaseFiles: ["LICENSE", "NOTICE.md", "README.md", "CHANGELOG.md", "VERSION", "forge.config.json", "package.json", "package-lock.json", "tsconfig.json"],
  watch: process.argv.includes("--watch"),
});
