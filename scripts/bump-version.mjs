// Increment the patch version in the commit being created.
import { bumpPatchVersion } from "forge-shell/scripts/version-hook";

bumpPatchVersion({ requiredHookFiles: ["scripts/bump-version.mjs", "scripts/install-hooks.mjs"] });
