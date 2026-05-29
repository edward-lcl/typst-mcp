import { describe, it, expect } from "vitest";
import { getDocumentStructure } from "../src/tools/structure.js";
import path from "node:path";

const FIXTURE = path.resolve("fixtures/sample.typ");

describe("doc_get_structure", () => {
  it("returns top-level sections with correct titles", async () => {
    const result = await getDocumentStructure({ doc_path: FIXTURE });
    const titles = result.sections.map((s) => s.title);
    expect(titles).toContain("Introduction");
    expect(titles).toContain("Methods");
    expect(titles).toContain("Results");
    expect(titles).toContain("Discussion");
  });

  it("returns nested subsections", async () => {
    const result = await getDocumentStructure({ doc_path: FIXTURE });
    const intro = result.sections.find((s) => s.title === "Introduction");
    expect(intro).toBeDefined();
    expect(intro!.subsections.length).toBeGreaterThan(0);
    const subTitles = intro!.subsections.map((s) => s.title);
    expect(subTitles).toContain("Background");
    expect(subTitles).toContain("Research Questions");
  });

  it("includes level, line_start, line_end, and id on each section", async () => {
    const result = await getDocumentStructure({ doc_path: FIXTURE });
    for (const section of result.sections) {
      expect(section.id).toBeTruthy();
      expect(section.level).toBe(1);
      expect(section.line_start).toBeGreaterThan(0);
      expect(section.line_end).toBeGreaterThan(section.line_start);
    }
  });

  it("section ids are stable slugs derived from title", async () => {
    const result = await getDocumentStructure({ doc_path: FIXTURE });
    const methods = result.sections.find((s) => s.title === "Methods");
    expect(methods!.id).toBe("methods");
  });
});
