// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Inspector philosophy (GUIDELINES-SHELL.md): every button other than General's is the first row of the section it
// acts on, right under the section's heading.

/** Put a section's button group in its first row, under the heading, whenever it is built. */
export function actionsFirst(section: HTMLElement, group: HTMLElement): void {
  const heading = section.querySelector(":scope > .section-title");
  if (heading) heading.after(group);
  else section.prepend(group);
}
