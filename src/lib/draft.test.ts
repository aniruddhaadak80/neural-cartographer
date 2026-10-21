import { describe, expect, it } from "vitest";

import { nextDraftFilePath } from "./draft";

describe("nextDraftFilePath", () => {
  it("starts at file1 for an empty draft", () => {
    expect(nextDraftFilePath([])).toBe("src/file1.ts");
  });

  it("does not reuse a path that is already taken", () => {
    expect(nextDraftFilePath(["src/file1.ts"])).toBe("src/file2.ts");
  });

  it("skips over gaps left by deleted files", () => {
    // Adding three files and deleting the first leaves file2 and file3 in the
    // draft; a counter based on the file count would hand out file3 again.
    const paths = ["src/file2.ts", "src/file3.ts"];
    const next = nextDraftFilePath(paths);
    expect(next).toBe("src/file4.ts");
    expect(paths).not.toContain(next);
  });

  it("never returns a duplicate for any sequence of additions and deletions", () => {
    let paths: string[] = [];
    for (let round = 0; round < 25; round += 1) {
      const next = nextDraftFilePath(paths);
      expect(paths).not.toContain(next);
      paths = [...paths, next];
      if (paths.length > 2 && round % 3 === 0) {
        paths = paths.slice(1);
      }
    }
    expect(new Set(paths).size).toBe(paths.length);
  });
});
