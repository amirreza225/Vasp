/**
 * Unit tests for the incremental generation helpers in generate.ts:
 *   - fileMatchesOnlyFilters  — maps --only specs to file-path patterns
 *   - computeUnifiedDiff      — LCS-based unified diff algorithm
 *   - parseOptions / OnlyFilter parsing is covered implicitly via fileMatchesOnlyFilters
 */

import { describe, expect, it } from "vitest";
import { fileMatchesOnlyFilters, computeUnifiedDiff } from "./generate.js";
import type { OnlyFilter } from "./generate.js";

// ---------------------------------------------------------------------------
// fileMatchesOnlyFilters
// ---------------------------------------------------------------------------

describe("fileMatchesOnlyFilters", () => {
  it("returns true for empty filters (no --only flag)", () => {
    expect(fileMatchesOnlyFilters("server/db/schema.ts", [])).toBe(true);
    expect(fileMatchesOnlyFilters("src/App.vue", [])).toBe(true);
  });

  describe("entity filter", () => {
    const filters: OnlyFilter[] = [{ type: "entity", name: "Task" }];

    it("matches schema file", () => {
      expect(fileMatchesOnlyFilters("server/db/schema.ts", filters)).toBe(true);
      expect(fileMatchesOnlyFilters("server/db/schema.js", filters)).toBe(true);
      expect(
        fileMatchesOnlyFilters("server/db/drizzle.config.ts", filters),
      ).toBe(true);
    });

    it("does not match unrelated files", () => {
      expect(
        fileMatchesOnlyFilters("server/routes/crud/task.ts", filters),
      ).toBe(false);
      expect(fileMatchesOnlyFilters("src/vasp/client/crud.ts", filters)).toBe(
        false,
      );
    });
  });

  describe("crud filter with name", () => {
    const filters: OnlyFilter[] = [{ type: "crud", name: "Task" }];

    it("matches the camelCase CRUD route file", () => {
      expect(
        fileMatchesOnlyFilters("server/routes/crud/task.ts", filters),
      ).toBe(true);
      expect(
        fileMatchesOnlyFilters("server/routes/crud/task.js", filters),
      ).toBe(true);
    });

    it("matches the client SDK crud file", () => {
      expect(fileMatchesOnlyFilters("src/vasp/client/crud.ts", filters)).toBe(
        true,
      );
    });

    it("does not match a different entity's CRUD file", () => {
      expect(
        fileMatchesOnlyFilters("server/routes/crud/user.ts", filters),
      ).toBe(false);
    });

    it("does not match unrelated paths", () => {
      expect(fileMatchesOnlyFilters("server/db/schema.ts", filters)).toBe(
        false,
      );
    });
  });

  describe("crud filter without name (all cruds)", () => {
    const filters: OnlyFilter[] = [{ type: "crud", name: null }];

    it("matches any CRUD route file", () => {
      expect(
        fileMatchesOnlyFilters("server/routes/crud/task.ts", filters),
      ).toBe(true);
      expect(
        fileMatchesOnlyFilters("server/routes/crud/user.js", filters),
      ).toBe(true);
    });

    it("matches client SDK crud file", () => {
      expect(fileMatchesOnlyFilters("src/vasp/client/crud.ts", filters)).toBe(
        true,
      );
    });
  });

  describe("query filter", () => {
    const filters: OnlyFilter[] = [{ type: "query", name: "getTasks" }];

    it("matches the camelCase query route file", () => {
      expect(
        fileMatchesOnlyFilters("server/routes/queries/getTasks.ts", filters),
      ).toBe(true);
    });

    it("does not match a different query", () => {
      expect(
        fileMatchesOnlyFilters("server/routes/queries/getUsers.ts", filters),
      ).toBe(false);
    });
  });

  describe("action filter", () => {
    const filters: OnlyFilter[] = [{ type: "action", name: "createTask" }];

    it("matches the camelCase action route file", () => {
      expect(
        fileMatchesOnlyFilters("server/routes/actions/createTask.ts", filters),
      ).toBe(true);
    });

    it("does not match a query file", () => {
      expect(
        fileMatchesOnlyFilters("server/routes/queries/createTask.ts", filters),
      ).toBe(false);
    });
  });

  describe("job filter", () => {
    const filters: OnlyFilter[] = [{ type: "job", name: "sendEmail" }];

    it("matches the camelCase job file", () => {
      expect(fileMatchesOnlyFilters("server/jobs/sendEmail.ts", filters)).toBe(
        true,
      );
    });

    it("does not match a different job", () => {
      expect(fileMatchesOnlyFilters("server/jobs/cleanup.ts", filters)).toBe(
        false,
      );
    });
  });

  describe("storage filter", () => {
    const filtersWithName: OnlyFilter[] = [
      { type: "storage", name: "Uploads" },
    ];
    const filtersNoName: OnlyFilter[] = [{ type: "storage", name: null }];

    it("matches storage route file by name", () => {
      expect(
        fileMatchesOnlyFilters(
          "server/routes/storage/uploads.ts",
          filtersWithName,
        ),
      ).toBe(true);
    });

    it("matches any storage route file without name filter", () => {
      expect(
        fileMatchesOnlyFilters(
          "server/routes/storage/profile.ts",
          filtersNoName,
        ),
      ).toBe(true);
      expect(
        fileMatchesOnlyFilters("server/storage/provider.ts", filtersNoName),
      ).toBe(true);
    });
  });

  describe("email filter", () => {
    const filters: OnlyFilter[] = [{ type: "email", name: null }];

    it("matches email files", () => {
      expect(fileMatchesOnlyFilters("server/email/mailer.ts", filters)).toBe(
        true,
      );
    });

    it("does not match non-email files", () => {
      expect(fileMatchesOnlyFilters("server/jobs/sendEmail.ts", filters)).toBe(
        false,
      );
    });
  });

  describe("realtime filter", () => {
    const filtersWithName: OnlyFilter[] = [
      { type: "realtime", name: "TaskChannel" },
    ];

    it("matches realtime channel file by camelCase name", () => {
      expect(
        fileMatchesOnlyFilters(
          "server/routes/realtime/taskChannel.ts",
          filtersWithName,
        ),
      ).toBe(true);
    });

    it("does not match a different channel", () => {
      expect(
        fileMatchesOnlyFilters(
          "server/routes/realtime/userChannel.ts",
          filtersWithName,
        ),
      ).toBe(false);
    });
  });

  describe("auth filter", () => {
    const filters: OnlyFilter[] = [{ type: "auth", name: null }];

    it("matches auth server files", () => {
      expect(fileMatchesOnlyFilters("server/auth/index.ts", filters)).toBe(
        true,
      );
      expect(fileMatchesOnlyFilters("server/auth/middleware.ts", filters)).toBe(
        true,
      );
    });

    it("matches Login/Register components", () => {
      expect(fileMatchesOnlyFilters("src/components/Login.vue", filters)).toBe(
        true,
      );
      expect(
        fileMatchesOnlyFilters("src/components/Register.vue", filters),
      ).toBe(true);
    });

    it("does not match other src files", () => {
      expect(fileMatchesOnlyFilters("src/App.vue", filters)).toBe(false);
    });
  });

  describe("admin filter", () => {
    const filters: OnlyFilter[] = [{ type: "admin", name: null }];

    it("matches admin panel files", () => {
      expect(
        fileMatchesOnlyFilters("admin/src/views/task/index.vue", filters),
      ).toBe(true);
    });

    it("does not match non-admin files", () => {
      expect(fileMatchesOnlyFilters("src/App.vue", filters)).toBe(false);
    });
  });

  describe("route/page filter", () => {
    const routeFilters: OnlyFilter[] = [{ type: "route", name: null }];
    const pageFilters: OnlyFilter[] = [{ type: "page", name: null }];

    it("matches src/ files for route filter", () => {
      expect(fileMatchesOnlyFilters("src/App.vue", routeFilters)).toBe(true);
      expect(fileMatchesOnlyFilters("src/router/index.ts", routeFilters)).toBe(
        true,
      );
    });

    it("matches src/ files for page filter", () => {
      expect(fileMatchesOnlyFilters("src/App.vue", pageFilters)).toBe(true);
    });
  });

  describe("unknown filter type", () => {
    const filters: OnlyFilter[] = [{ type: "unknown", name: null }];

    it("returns false for unknown block types", () => {
      expect(fileMatchesOnlyFilters("server/db/schema.ts", filters)).toBe(
        false,
      );
    });
  });

  describe("multiple filters", () => {
    const filters: OnlyFilter[] = [
      { type: "entity", name: "Task" },
      { type: "crud", name: "Task" },
    ];

    it("matches file that satisfies any filter", () => {
      expect(fileMatchesOnlyFilters("server/db/schema.ts", filters)).toBe(true);
      expect(
        fileMatchesOnlyFilters("server/routes/crud/task.ts", filters),
      ).toBe(true);
    });

    it("does not match file that satisfies none", () => {
      expect(
        fileMatchesOnlyFilters("server/routes/actions/createTask.ts", filters),
      ).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// computeUnifiedDiff
// ---------------------------------------------------------------------------

describe("computeUnifiedDiff", () => {
  it("returns empty string for identical content", () => {
    const content = "line1\nline2\nline3\n";
    expect(computeUnifiedDiff(content, content, "file.txt")).toBe("");
  });

  it("generates diff headers for changed files", () => {
    const diff = computeUnifiedDiff("old\n", "new\n", "path/to/file.ts");
    expect(diff).toContain("--- a/path/to/file.ts");
    expect(diff).toContain("+++ b/path/to/file.ts");
  });

  it("shows added lines with + prefix", () => {
    const diff = computeUnifiedDiff("", "new line\n", "file.ts");
    expect(diff).toContain("+new line");
  });

  it("shows removed lines with - prefix", () => {
    const diff = computeUnifiedDiff("old line\n", "", "file.ts");
    expect(diff).toContain("-old line");
  });

  it("shows context lines with space prefix", () => {
    const oldText = [
      "ctx1",
      "ctx2",
      "ctx3",
      "old",
      "ctx4",
      "ctx5",
      "ctx6",
    ].join("\n");
    const newText = [
      "ctx1",
      "ctx2",
      "ctx3",
      "new",
      "ctx4",
      "ctx5",
      "ctx6",
    ].join("\n");
    const diff = computeUnifiedDiff(oldText, newText, "file.ts");
    expect(diff).toContain(" ctx1");
    expect(diff).toContain("-old");
    expect(diff).toContain("+new");
  });

  it("includes @@ hunk header", () => {
    const diff = computeUnifiedDiff("line1\n", "line2\n", "file.ts");
    expect(diff).toMatch(/@@.*@@/);
  });

  it("handles new file (empty old content)", () => {
    const diff = computeUnifiedDiff("", "hello\nworld\n", "new.ts");
    expect(diff).toContain("+hello");
    expect(diff).toContain("+world");
    // No deletion lines (lines starting with '-' that aren't the --- header)
    const deletionLines = diff.split("\n").filter((l) => /^-[^-]/.test(l));
    expect(deletionLines).toHaveLength(0);
  });

  it("handles deleted file content (empty new content)", () => {
    const diff = computeUnifiedDiff("hello\nworld\n", "", "del.ts");
    expect(diff).toContain("-hello");
    expect(diff).toContain("-world");
    // No addition lines (lines starting with '+' that aren't the +++ header)
    const additionLines = diff.split("\n").filter((l) => /^\+[^+]/.test(l));
    expect(additionLines).toHaveLength(0);
  });

  it("merges nearby changes into a single hunk", () => {
    // Two changes within 6 lines of each other (default context=3)
    const oldLines = ["a", "b", "c", "old1", "e", "f", "g", "old2", "i"];
    const newLines = ["a", "b", "c", "new1", "e", "f", "g", "new2", "i"];
    const diff = computeUnifiedDiff(
      oldLines.join("\n"),
      newLines.join("\n"),
      "f.ts",
    );
    // Should produce one hunk header, not two
    const hunkCount = (diff.match(/^@@/gm) ?? []).length;
    expect(hunkCount).toBe(1);
  });

  it("produces separate hunks for distant changes", () => {
    // Two changes far apart (more than 6 lines = 3 context each side)
    const oldLines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
    const newLines = [...oldLines];
    newLines[1] = "changed-early";
    newLines[18] = "changed-late";
    const diff = computeUnifiedDiff(
      oldLines.join("\n"),
      newLines.join("\n"),
      "f.ts",
    );
    const hunkCount = (diff.match(/^@@/gm) ?? []).length;
    expect(hunkCount).toBe(2);
  });
});
