import { describe, it, expect } from "vitest";
import { getSectionContent } from "../src/tools/section.js";
import path from "node:path";

const FIXTURE = path.resolve("fixtures/sample.typ");

describe("doc_get_section", () => {
  it("returns raw source for a top-level section by id", async () => {
    const result = await getSectionContent({ doc_path: FIXTURE, section_id: "methods" });
    expect(result.content_raw).toContain("Experimental Design");
    expect(result.content_raw).toContain("Protocol");
  });

  it("returns plain text with LaTeX/Typst markup stripped", async () => {
    const result = await getSectionContent({ doc_path: FIXTURE, section_id: "introduction" });
    expect(result.content_text).not.toMatch(/^=/m);
    expect(result.content_text).toContain("cryoprotective agents");
  });

  it("returns word count greater than zero", async () => {
    const result = await getSectionContent({ doc_path: FIXTURE, section_id: "results" });
    expect(result.word_count).toBeGreaterThan(0);
  });

  it("throws for unknown section id", async () => {
    await expect(
      getSectionContent({ doc_path: FIXTURE, section_id: "nonexistent-section" })
    ).rejects.toThrow(/not found/i);
  });
});
