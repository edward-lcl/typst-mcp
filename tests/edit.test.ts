import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rewriteSection, insertParagraph } from "../src/tools/edit.js";
import path from "node:path";
import fs from "node:fs";

const FIXTURE = path.resolve("fixtures/sample.typ");
const SCRATCH = path.resolve("fixtures/scratch.typ");

beforeEach(() => {
  fs.copyFileSync(FIXTURE, SCRATCH);
});

afterEach(() => {
  if (fs.existsSync(SCRATCH)) fs.unlinkSync(SCRATCH);
  // clean up any backups created during tests
  for (const f of fs.readdirSync("fixtures").filter((n) => n.startsWith("scratch.typ.bak"))) {
    fs.unlinkSync(path.resolve("fixtures", f));
  }
});

describe("doc_rewrite_section", () => {
  it("replaces section content and preserves the heading", async () => {
    const result = await rewriteSection({
      doc_path: SCRATCH,
      section_id: "results",
      new_content: "New results content with updated data.",
      reason: "test rewrite",
    });
    expect(result.applied).toBe(true);
    expect(result.backup_path).toBeTruthy();
    expect(fs.existsSync(result.backup_path)).toBe(true);

    const updated = fs.readFileSync(SCRATCH, "utf-8");
    expect(updated).toContain("= Results");
    expect(updated).toContain("New results content with updated data.");
    expect(updated).not.toContain("Preliminary data shows 85% viability");
  });

  it("recompiles after rewrite and returns success when valid", async () => {
    const result = await rewriteSection({
      doc_path: SCRATCH,
      section_id: "discussion",
      new_content: "Updated discussion with new findings.",
      reason: "test valid rewrite",
    });
    expect(result.applied).toBe(true);
    expect(result.compile_errors).toHaveLength(0);
  });

  it("restores backup when new content causes compile errors", async () => {
    const originalContent = fs.readFileSync(SCRATCH, "utf-8");
    const result = await rewriteSection({
      doc_path: SCRATCH,
      section_id: "introduction",
      new_content: "#invalid-function-that-does-not-exist(",
      reason: "test bad content",
    });
    expect(result.applied).toBe(false);
    expect(result.compile_errors.length).toBeGreaterThan(0);
    // File should be restored to original
    const restored = fs.readFileSync(SCRATCH, "utf-8");
    expect(restored).toBe(originalContent);
  });

  it("throws for unknown section id", async () => {
    await expect(
      rewriteSection({
        doc_path: SCRATCH,
        section_id: "nonexistent",
        new_content: "content",
        reason: "test",
      })
    ).rejects.toThrow(/not found/i);
  });
});

describe("doc_insert_paragraph", () => {
  it("inserts a paragraph at the end of a section", async () => {
    const result = await insertParagraph({
      doc_path: SCRATCH,
      section_id: "results",
      paragraph_text: "Additional results from the secondary assay.",
      position: "end",
    });
    expect(result.applied).toBe(true);
    const updated = fs.readFileSync(SCRATCH, "utf-8");
    expect(updated).toContain("Additional results from the secondary assay.");
  });

  it("inserts a paragraph at the start of a section", async () => {
    const result = await insertParagraph({
      doc_path: SCRATCH,
      section_id: "methods",
      paragraph_text: "Overview: this section describes experimental methods.",
      position: "start",
    });
    expect(result.applied).toBe(true);
    const updated = fs.readFileSync(SCRATCH, "utf-8");
    expect(updated).toContain("Overview: this section describes experimental methods.");
  });
});
