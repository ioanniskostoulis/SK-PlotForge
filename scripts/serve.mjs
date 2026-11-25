// Licensed under the GNU General Public License v2 or later. See LICENSE.
import { pathToFileURL } from "node:url";
import { startServer as startForgeServer } from "forge-shell/scripts/serve";

export function startServer(options = {}) { return startForgeServer(options); }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer();
