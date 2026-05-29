import fs from "node:fs";
import { getDocumentStructure, SectionNode } from "./structure.js";

export interface SectionResult {
  content_raw: string;
  content_text: string;
  word_count: number;
  citations: string[];
  figures_referenced: string[];
}

function stripTypstMarkup(text: string): string {
  return text
    .replace(/^={1,6}\s+.+$/gm, "")       // remove headings
    .replace(/#[a-zA-Z]+\([^)]*\)/g, "")   // remove #commands(...)
    .replace(/@[a-zA-Z0-9_-]+/g, "")       // remove @cite refs
    .replace(/<[^>]+>/g, "")               // remove angle-bracket labels
    .replace(/\[\s*\]/g, "")               // remove empty brackets
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractCitations(raw: string): string[] {
  const matches = raw.match(/@[a-zA-Z0-9_-]+/g) ?? [];
  return [...new Set(matches)];
}

function extractFigures(raw: string): string[] {
  const matches = raw.match(/@fig:[a-zA-Z0-9_-]+/g) ?? [];
  return [...new Set(matches)];
}

function findSectionById(sections: SectionNode[], id: string): SectionNode | undefined {
  for (const s of sections) {
    if (s.id === id) return s;
    const found = findSectionById(s.subsections, id);
    if (found) return found;
  }
  return undefined;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function getSectionContent(input: {
  doc_path: string;
  section_id: string;
}): Promise<SectionResult> {
  const source = fs.readFileSync(input.doc_path, "utf-8");
  const lines = source.split("\n");

  const structure = await getDocumentStructure({ doc_path: input.doc_path });
  const section = findSectionById(structure.sections, input.section_id);

  if (!section) {
    throw new Error(`Section not found: "${input.section_id}"`);
  }

  // line_start is 1-based and points to the heading line itself
  // We want the content starting from the line after the heading
  const raw = lines.slice(section.line_start, section.line_end).join("\n").trim();
  const text = stripTypstMarkup(raw);

  return {
    content_raw: raw,
    content_text: text,
    word_count: countWords(text),
    citations: extractCitations(raw),
    figures_referenced: extractFigures(raw),
  };
}
