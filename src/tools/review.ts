import fs from "node:fs";
import { getDocumentStructure, SectionNode } from "./structure.js";
import { getSectionContent } from "./section.js";

export type ReviewType = "clarity" | "completeness" | "citations" | "consistency";

export interface Finding {
  type: string;
  location: { line: number; text: string };
  issue: string;
  suggestion: string;
  confidence: number;
}

export interface ReviewResult {
  findings: Finding[];
}

function findSectionById(sections: SectionNode[], id: string): SectionNode | undefined {
  for (const s of sections) {
    if (s.id === id) return s;
    const found = findSectionById(s.subsections, id);
    if (found) return found;
  }
  return undefined;
}

function checkCompleteness(section: SectionNode, content: Awaited<ReturnType<typeof getSectionContent>>): Finding[] {
  const findings: Finding[] = [];

  if (content.word_count < 30 && section.level === 1) {
    findings.push({
      type: "completeness",
      location: { line: section.line_start, text: `= ${section.title}` },
      issue: `Section "${section.title}" is very short (${content.word_count} words). Top-level sections typically need more content.`,
      suggestion: "Expand this section with background, evidence, or sub-structure.",
      confidence: 0.8,
    });
  }

  if (section.subsections.length === 1) {
    findings.push({
      type: "completeness",
      location: { line: section.line_start, text: `= ${section.title}` },
      issue: "Section has only one subsection, which is typically a structural smell.",
      suggestion: "Either add a second subsection or fold the content into the parent.",
      confidence: 0.7,
    });
  }

  return findings;
}

function checkCitations(content: Awaited<ReturnType<typeof getSectionContent>>, section: SectionNode): Finding[] {
  const findings: Finding[] = [];

  if (section.level === 1 && content.word_count > 50 && content.citations.length === 0) {
    findings.push({
      type: "citations",
      location: { line: section.line_start, text: `= ${section.title}` },
      issue: `Section "${section.title}" makes claims without any citations.`,
      suggestion: "Add supporting references for key claims in this section.",
      confidence: 0.75,
    });
  }

  return findings;
}

export async function reviewSection(input: {
  doc_path: string;
  section_id: string;
  review_types: ReviewType[];
  context?: string;
}): Promise<ReviewResult> {
  const structure = await getDocumentStructure({ doc_path: input.doc_path });

  function flattenSections(nodes: SectionNode[]): SectionNode[] {
    return nodes.flatMap((n) => [n, ...flattenSections(n.subsections)]);
  }

  const all = flattenSections(structure.sections);
  const section = all.find((s) => s.id === input.section_id);
  if (!section) throw new Error(`Section not found: "${input.section_id}"`);

  const content = await getSectionContent({ doc_path: input.doc_path, section_id: input.section_id });
  const findings: Finding[] = [];

  for (const type of input.review_types) {
    if (type === "completeness") findings.push(...checkCompleteness(section, content));
    if (type === "citations") findings.push(...checkCitations(content, section));
    // clarity and consistency are heuristic-only stubs; real implementation would call LLM
  }

  return { findings };
}

// ── doc_diff ───────────────────────────────────────────────────────────────

export interface DiffSection {
  section_id: string;
  text: string;
}

export interface RewriteEntry {
  section_id: string;
  before: string;
  after: string;
}

export interface DiffResult {
  additions: DiffSection[];
  deletions: DiffSection[];
  rewrites: RewriteEntry[];
  unchanged_sections: string[];
}

export async function diffDocuments(input: {
  doc_path_a: string;
  doc_path_b: string;
  mode: "source" | "semantic";
}): Promise<DiffResult> {
  const structA = await getDocumentStructure({ doc_path: input.doc_path_a });
  const structB = await getDocumentStructure({ doc_path: input.doc_path_b });

  function flattenSections(nodes: SectionNode[]): SectionNode[] {
    return nodes.flatMap((n) => [n, ...flattenSections(n.subsections)]);
  }

  const sectionsA = flattenSections(structA.sections);
  const sectionsB = flattenSections(structB.sections);

  const mapA = new Map(sectionsA.map((s) => [s.id, s]));
  const mapB = new Map(sectionsB.map((s) => [s.id, s]));

  const contentA = new Map<string, string>();
  const contentB = new Map<string, string>();

  for (const s of sectionsA) {
    const raw = fs.readFileSync(input.doc_path_a, "utf-8").split("\n")
      .slice(s.line_start, s.line_end).join("\n").trim();
    contentA.set(s.id, raw);
  }
  for (const s of sectionsB) {
    const raw = fs.readFileSync(input.doc_path_b, "utf-8").split("\n")
      .slice(s.line_start, s.line_end).join("\n").trim();
    contentB.set(s.id, raw);
  }

  const additions: DiffSection[] = [];
  const deletions: DiffSection[] = [];
  const rewrites: RewriteEntry[] = [];
  const unchanged_sections: string[] = [];

  for (const [id, s] of mapB) {
    if (!mapA.has(id)) {
      additions.push({ section_id: id, text: contentB.get(id) ?? "" });
    } else {
      const a = contentA.get(id) ?? "";
      const b = contentB.get(id) ?? "";
      if (a === b) {
        unchanged_sections.push(id);
      } else {
        rewrites.push({ section_id: id, before: a, after: b });
      }
    }
  }

  for (const [id] of mapA) {
    if (!mapB.has(id)) {
      deletions.push({ section_id: id, text: contentA.get(id) ?? "" });
    }
  }

  return { additions, deletions, rewrites, unchanged_sections };
}
