// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The engine tests of PlotForge: `npm test`. The TypeScript tests in tests/engine are bundled with esbuild and run
// with node --test, together with the plain tests in tests/.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";

const dir = "tests/engine";
const sources = readdirSync(dir).filter((name) => name.endsWith(".test.ts"));
rmSync("build/tests/engine", { recursive: true, force: true });
await build({ entryPoints: sources.map((name) => `${dir}/${name}`), bundle: true, platform: "node", format: "cjs", outdir: "build/tests/engine", outExtension: { ".js": ".cjs" }, logLevel: "error" });
const files = [
  ...sources.map((name) => `build/tests/engine/${name.replace(/\.ts$/, ".cjs")}`),
  ...readdirSync("tests").filter((name) => name.endsWith(".test.mjs")).map((name) => `tests/${name}`),
];
const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
