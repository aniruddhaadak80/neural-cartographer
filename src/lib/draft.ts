/**
 * Helpers for the browser-side survey editor.
 *
 * Kept out of the React component so the rules can be unit tested without
 * rendering anything.
 */

/**
 * Default path for a newly added draft file.
 *
 * The name must not collide with a path already in the draft: the API rejects
 * duplicate paths (`file paths must be unique`), so a collision would leave the
 * survey un-creatable until the user renamed one of the files by hand.
 */
export function nextDraftFilePath(existingPaths: string[]): string {
  const used = new Set(existingPaths);
  let index = existingPaths.length + 1;
  let candidate = `src/file${index}.ts`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `src/file${index}.ts`;
  }
  return candidate;
}
