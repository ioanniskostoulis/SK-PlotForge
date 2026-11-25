// Install the local Git hook that raises the patch version on each commit.
import { installVersionHook } from "forge-shell/scripts/version-hook";

installVersionHook({ marker: "# PlotForge automatic patch version hook" });
