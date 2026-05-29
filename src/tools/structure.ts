import fs from "node:fs";

export interface SectionNode {
  id: string;
  title: string;
  level: number;
  line_start: number;
  line_end: number;
  word_count: number;
  subsections: SectionNode[];
}

export interface StructureResult {
  title: string;
  sections: SectionNode[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface RawHeading {
  level: number;
  title: string;
  line: number; // 1-based
}

function parseHeadings(lines: string[]): RawHeading[] {
  const headings: RawHeading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(={1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        title: match[2].trim(),
        line: i + 1,
      });
    }
  }
  return headings;
}

function buildTree(
  headings: RawHeading[],
  lines: string[],
  minLevel: number,
  index: { value: number }
): SectionNode[] {
  const nodes: SectionNode[] = [];

  while (index.value < headings.length) {
    const h = headings[index.value];
    if (h.level < minLevel) break;
    if (h.level > minLevel) {
      index.value++;
      continue;
    }

    index.value++;
    const subsections = buildTree(headings, lines, minLevel + 1, index);

    const nextSiblingOrParent = headings.find(
      (hh, i) => i >= index.value - subsections.length && hh.level <= minLevel && hh !== h
    );
    // Compute line_end: up to next heading at same or higher level, or end of file
    const nextAtSameOrHigher = headings.slice(index.value - subsections.length).find((hh) => hh.level <= minLevel);
    const line_end = nextAtSameOrHigher ? nextAtSameOrHigher.line - 1 : lines.length;

    const sectionText = lines.slice(h.line, line_end).join("\n");

    nodes.push({
      id: slugify(h.title),
      title: h.title,
      level: h.level,
      line_start: h.line,
      line_end,
      word_count: countWords(sectionText),
      subsections,
    });
  }

  return nodes;
}

export async function getDocumentStructure(input: {
  doc_path: string;
}): Promise<StructureResult> {
  const ext = input.doc_path.toLowerCase().endsWith(".tex") ? "tex" : "typ";
  const source = fs.readFileSync(input.doc_path, "utf-8");
  const lines = source.split("\n");
  const headings = ext === "tex" ? parseLatexHeadings(lines) : parseHeadings(lines);

  if (headings.length === 0) {
    return { title: "", sections: [] };
  }

  const topLevel = headings[0].level;
  const index = { value: 0 };
  const sections = buildTree(headings, lines, topLevel, index);

  return { title: sections[0]?.title ?? "", sections };
}

function parseLatexHeadings(lines: string[]): RawHeading[] {
  const LATEX_LEVELS: Record<string, number> = {
    "\\section": 1,
    "\\subsection": 2,
    "\\subsubsection": 3,
    "\\paragraph": 4,
    "\\subparagraph": 5,
  };
  const headings: RawHeading[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (const [cmd, level] of Object.entries(LATEX_LEVELS)) {
      const re = new RegExp(`\\${cmd}\\*?\\{([^}]+)\\}`);
      const match = lines[i].match(re);
      if (match) {
        headings.push({ level, title: match[1].trim(), line: i + 1 });
        break;
      }
    }
  }
  return headings;
}
