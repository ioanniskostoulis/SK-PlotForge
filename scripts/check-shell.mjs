// Licensed under the GNU General Public License v2 or later. See LICENSE.
import { checkForgeApp } from "forge-shell/scripts/check-app";

const result = checkForgeApp();
console.log(`${result.product} built shell matches its profile and installed package.`);
