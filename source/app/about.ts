// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The four Help dialogs come from the shell (forge-shell/app/about); PlotForge adds its own About paragraph (the shell
// writes the opening, trademark line and license). Licenses names only what the app is built on (the shell's
// SHARED_WORKS); the fonts are credited in NOTICE.md, with their licence shipped beside them in forge-fonts.
import { showAbout as sharedAbout, showLicenses as sharedLicenses, type InfoOptions } from "forge-shell/app/about";

export function showAbout(info: InfoOptions): void {
  sharedAbout(info, `
        <div class="block">
          <p class="about-intro">Plots follow the look of report charts made in Excel. Image steps, thresholds and measurements follow the definitions of ImageJ and of the papers each method cites, written anew for PlotForge. Original images and data files are read and never changed.</p>
        </div>`);
}

/** PlotForge's own license, the shared works and the full GPL text. */
export function showLicenses(info: InfoOptions): Promise<void> {
  return sharedLicenses(info);
}
