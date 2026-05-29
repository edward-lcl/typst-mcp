import { describe, it, expect } from "vitest";
import { reviewSection, diffDocuments } from "../src/tools/review.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const FIXTURE = path.resolve("fixtures/sample.typ");

describe("doc_review_section", () => {
  it("returns findings array for a real section", async () => {
    const result = await reviewSection({
      doc_path: FIXTURE,
      section_id: "introduction",
      review_types: ["completeness", "citations"],
    });
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it("throws for an unknown section", async () => {
    await expect(
      reviewSection({ doc_path: FIXTURE, section_id: "doesnotexist", review_types: ["clarity"] })
    ).rejects.toThrow(/not found/i);
  });
});

describe("doc_diff", () => {
  it("detects additions between two documents", async () => {
    const tmp = path.join(os.tmpdir(), `doc-mcp-diff-${Date.now()}.typ`);
    const original = fs.readFileSync(FIXTURE, "utf-8");
    fs.writeFileSync(tmp, original + "\n= Appendix\n\nNew appendix content.\n");
    try {
      const result = await diffDocuments({ doc_path_a: FIXTURE, doc_path_b: tmp, mode: "source" });
      expect(result.additions.length).toBeGreaterThan(0);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it("returns unchanged sections when docs are identical", async () => {
    const result = await diffDocuments({ doc_path_a: FIXTURE, doc_path_b: FIXTURE, mode: "source" });
    expect(result.additions).toHaveLength(0);
    expect(result.deletions).toHaveLength(0);
    expect(result.unchanged_sections.length).toBeGreaterThan(0);
  });
});
