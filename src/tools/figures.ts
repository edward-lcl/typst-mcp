import fs from "node:fs";
import { getDocumentStructure, SectionNode } from "./structure.js";

export interface FigureEntry {
  label: string;
  caption: string;
  source_file: string;
  line: number;
  referenced_in: string[];
}

export interface FigureInventoryResult {
  figures: FigureEntry[];
}

function flattenSections(nodes: SectionNode[]): SectionNode[] {
  return nodes.flatMap((n) => [n, ...flattenSections(n.subsections)]);
}

function findReferencingSections(label: string, sections: SectionNode[], lines: string[]): string[] {
  const refs: string[] = [];
  const pattern = new RegExp(`@${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  for (const section of sections) {
    const sectionLines = lines.slice(section.line_start, section.line_end);
    if (sectionLines.some((l) => pattern.test(l))) {
      refs.push(section.id);
    }
  }
  return refs;
}

export async function figureInventory(input: { doc_path: string }): Promise<FigureInventoryResult> {
  const source = fs.readFileSync(input.doc_path, "utf-8");
  const lines = source.split("\n");

  const structure = await getDocumentStructure({ doc_path: input.doc_path });
  const allSections = flattenSections(structure.sections);

  const figures: FigureEntry[] = [];

  // Match Typst figure blocks:
  // #figure(
  //   image("file.png"),        <-- optional image source
  //   caption: [Caption text],
  // ) <label>
  // Also handles inline: #figure(rect(), caption: [text]) <label>

  const figureBlockRe = /#figure\s*\(/g;
  let match;

  while ((match = figureBlockRe.exec(source)) !== null) {
    const startIdx = match.index;
    const lineNum = source.slice(0, startIdx).split("\n").length;

    // Find the closing ) <label> — scan ahead for the block end
    let depth = 1;
    let i = startIdx + match[0].length;
    while (i < source.length && depth > 0) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")") depth--;
      i++;
    }
    const blockEnd = i;
    const block = source.slice(startIdx, blockEnd);
    const afterBlock = source.slice(blockEnd, Math.min(blockEnd + 80, source.length));

    // Extract label from <label> immediately after closing paren (ignoring whitespace/newlines)
    const labelMatch = afterBlock.match(/^\s*<([^>]+)>/);
    const label = labelMatch ? labelMatch[1] : "";

    // Extract caption text
    const captionMatch = block.match(/caption\s*:\s*\[([^\]]+)\]/);
    const caption = captionMatch ? captionMatch[1].trim() : "";

    // Extract image source file if present
    const imageMatch = block.match(/image\s*\(\s*"([^"]+)"/);
    const source_file = imageMatch ? imageMatch[1] : "";

    if (!label && !caption) continue; // skip unlabeled, uncaptioned blocks

    const referenced_in = label
      ? findReferencingSections(label, allSections, lines)
      : [];

    figures.push({ label, caption, source_file, line: lineNum, referenced_in });
  }

  return { figures };
}
