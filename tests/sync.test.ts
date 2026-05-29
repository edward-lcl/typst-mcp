import { describe, it, expect } from "vitest";
import { sourceToPdf, pdfToSource } from "../src/tools/sync.js";
import path from "node:path";

const FIXTURE = path.resolve("fixtures/sample.typ");

describe("doc_source_to_pdf", () => {
  it("returns a page number for a known line in the introduction", async () => {
    const result = await sourceToPdf({ doc_path: FIXTURE, line: 3 });
    expect(result.page).toBeGreaterThan(0);
    expect(result.section_id).toBe("introduction");
  });

  it("returns a page number for a line in the methods section", async () => {
    const result = await sourceToPdf({ doc_path: FIXTURE, line: 28 });
    expect(result.page).toBeGreaterThan(0);
    expect(result.section_id).toBe("methods");
  });

  it("throws for a line number out of range", async () => {
    await expect(
      sourceToPdf({ doc_path: FIXTURE, line: 99999 })
    ).rejects.toThrow(/out of range/i);
  });
});

describe("doc_pdf_to_source", () => {
  it("returns source sections for page 1", async () => {
    const result = await pdfToSource({ doc_path: FIXTURE, page: 1 });
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.sections[0].section_id).toBeTruthy();
    expect(result.sections[0].line_start).toBeGreaterThan(0);
  });

  it("returns empty sections array for a page beyond the document", async () => {
    const result = await pdfToSource({ doc_path: FIXTURE, page: 999 });
    expect(result.sections).toHaveLength(0);
  });
});
