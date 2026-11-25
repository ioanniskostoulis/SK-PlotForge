// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Generate the desktop package configuration from the shared defaults and this application's profile.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { electronBuilderConfig } from "forge-shell/scripts/package-config";
import { renderDmgBackground } from "forge-shell/scripts/dmg-background";

const config = JSON.parse(readFileSync("forge.config.json", "utf8"));
mkdirSync("build", { recursive: true });
writeFileSync("build/electron-builder.json", `${JSON.stringify(electronBuilderConfig(config), null, 2)}\n`);
// The macOS disk image window is drawn from the profile; only a macOS package uses it.
if (process.platform === "darwin") renderDmgBackground();
