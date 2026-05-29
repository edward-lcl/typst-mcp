import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDocumentStructure, SectionNode } from "./structure.js";

const execFileAsync = promisify(execFile);

interface SectionPageEntry {
  section_id: string;
  title: string;
  level: number;
  page: number;
  line_start: number;
  line_end: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function flattenSections(nodes: SectionNode[]): SectionNode[] {
  const result: SectionNode[] = [];
  for (const node of nodes) {
    result.push(node);
    result.push(...flattenSections(node.subsections));
  }
  return result;
}

async function buildSectionPageIndex(doc_path: string): Promise<SectionPageEntry[]> {
  const dir = path.dirname(path.resolve(doc_path));
  const base = path.basename(doc_path);

  // Wrapper must live inside the root so Typst accepts it
  const wrapperPath = path.join(dir, `__doc-mcp-sync-${Date.now()}.typ`);
  const wrapperContent = [
    "#show heading: it => {",
    "  it",
    "  [#metadata((title: it.body.text, level: it.level, page: counter(page).at(here()).first())) <__sync_heading__>]",
    "}",
    `#include "${base}"`,
  ].join("\n");

  fs.writeFileSync(wrapperPath, wrapperContent);

  try {
    const { stdout } = await execFileAsync("typst", [
      "query",
      "--root", dir,
      wrapperPath,
      "<__sync_heading__>",
      "--pretty",
    ]);

    const queryResults: Array<{ value: { title: string; level: number; page: number } }> =
      JSON.parse(stdout);

    const structure = await getDocumentStructure({ doc_path });
    const allSections = flattenSections(structure.sections);
    const lineMap = new Map(allSections.map((s) => [slugify(s.title), s]));

    return queryResults.map((r) => {
      const id = slugify(r.value.title);
      const src = lineMap.get(id);
      return {
        section_id: id,
        title: r.value.title,
        level: r.value.level,
        page: r.value.page,
        line_start: src?.line_start ?? 0,
        line_end: src?.line_end ?? 0,
      };
    });
  } finally {
    if (fs.existsSync(wrapperPath)) fs.unlinkSync(wrapperPath);
  }
}

export interface SourceToPdfResult {
  page: number;
  section_id: string;
  section_title: string;
}

export async function sourceToPdf(input: {
  doc_path: string;
  line: number;
}): Promise<SourceToPdfResult> {
  const source = fs.readFileSync(input.doc_path, "utf-8");
  const totalLines = source.split("\n").length;

  if (input.line < 1 || input.line > totalLines) {
    throw new Error(`Line ${input.line} out of range (document has ${totalLines} lines)`);
  }

  const index = await buildSectionPageIndex(input.doc_path);
  const sorted = [...index].sort((a, b) => a.line_start - b.line_start);

  let match = sorted[0];
  for (const entry of sorted) {
    if (entry.line_start <= input.line) match = entry;
    else break;
  }

  if (!match) {
    throw new Error(`Could not map line ${input.line} to a section`);
  }

  return { page: match.page, section_id: match.section_id, section_title: match.title };
}

export interface PdfSection {
  section_id: string;
  title: string;
  level: number;
  line_start: number;
  line_end: number;
}

export interface PdfToSourceResult {
  sections: PdfSection[];
}

export async function pdfToSource(input: {
  doc_path: string;
  page: number;
}): Promise<PdfToSourceResult> {
  const index = await buildSectionPageIndex(input.doc_path);
  const onPage = index.filter((e) => e.page === input.page);

  return {
    sections: onPage.map((e) => ({
      section_id: e.section_id,
      title: e.title,
      level: e.level,
      line_start: e.line_start,
      line_end: e.line_end,
    })),
  };
}
