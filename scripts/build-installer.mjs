// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Pack the unpacked Windows build as the Forge setup of PlotForge.
import { buildInstaller } from "forge-shell/scripts/build-installer";

const result = await buildInstaller({ stageOnly: process.argv.includes("--stage-only") });
console.log(`PlotForge setup staged: ${result.manifest.files.length} files, ${result.manifest.bytes} bytes.`);
