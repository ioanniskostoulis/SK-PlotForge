// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The interface tests of PlotForge (tests/app) and the shell's conformance tests that every application runs:
// `npm run test:app`.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";

const shellDir = "node_modules/forge-shell/tests/conformance";
const shellTests = readdirSync(shellDir).filter((name) => name.endsWith(".ts"));
if (!shellTests.length) throw new Error(`No conformance tests in ${shellDir}. Run npm install.`);
const appDir = "tests/app";
const appTests = readdirSync(appDir).filter((name) => name.endsWith(".test.ts"));
rmSync("build/tests/shell", { recursive: true, force: true });
rmSync("build/tests/app", { recursive: true, force: true });
const options = { bundle: true, platform: "node", format: "cjs", outExtension: { ".js": ".cjs" }, logLevel: "error" };
await build({ ...options, entryPoints: shellTests.map((name) => `${shellDir}/${name}`), outdir: "build/tests/shell" });
await build({ ...options, entryPoints: appTests.map((name) => `${appDir}/${name}`), outdir: "build/tests/app" });
// Each file is named: a folder given to node --test runs only files named like *.test.js.
const files = [
  ...appTests.map((name) => `build/tests/app/${name.replace(/\.ts$/, ".cjs")}`),
  ...shellTests.map((name) => `build/tests/shell/${name.replace(/\.ts$/, ".cjs")}`),
];
const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
