import fs from "node:fs";
import path from "node:path";
import { getDocumentStructure, SectionNode } from "./structure.js";
import { compileDocument, CompileError } from "./compile.js";

function findSectionById(sections: SectionNode[], id: string): SectionNode | undefined {
  for (const s of sections) {
    if (s.id === id) return s;
    const found = findSectionById(s.subsections, id);
    if (found) return found;
  }
  return undefined;
}

function makeBackupPath(doc_path: string): string {
  return `${doc_path}.bak.${Date.now()}`;
}

function diffSummary(original: string, updated: string): string {
  const origLines = original.split("\n").length;
  const updLines = updated.split("\n").length;
  const delta = updLines - origLines;
  return `${Math.abs(delta)} line${Math.abs(delta) !== 1 ? "s" : ""} ${delta >= 0 ? "added" : "removed"}`;
}

// ── doc_rewrite_section ────────────────────────────────────────────────────

export interface RewriteResult {
  applied: boolean;
  backup_path: string;
  diff_summary: string;
  compile_errors: CompileError[];
}

export async function rewriteSection(input: {
  doc_path: string;
  section_id: string;
  new_content: string;
  reason: string;
}): Promise<RewriteResult> {
  const { doc_path, section_id, new_content } = input;

  const structure = await getDocumentStructure({ doc_path });
  const section = findSectionById(structure.sections, section_id);
  if (!section) throw new Error(`Section not found: "${section_id}"`);

  const original = fs.readFileSync(doc_path, "utf-8");
  const lines = original.split("\n");

  // line_start (1-based) is the heading line; keep it, replace everything after up to line_end
  const headingLine = lines[section.line_start - 1]; // the "= Section Title" line
  const before = lines.slice(0, section.line_start);   // up to and including heading
  const after = lines.slice(section.line_end);          // everything after this section

  const updated = [...before, "", new_content, ...after].join("\n");

  const backup_path = makeBackupPath(doc_path);
  fs.writeFileSync(backup_path, original);
  fs.writeFileSync(doc_path, updated);

  const compileResult = await compileDocument({ doc_path });

  if (!compileResult.success) {
    // Restore original
    fs.writeFileSync(doc_path, original);
    return {
      applied: false,
      backup_path,
      diff_summary: "Rolled back — compile failed",
      compile_errors: compileResult.errors,
    };
  }

  return {
    applied: true,
    backup_path,
    diff_summary: diffSummary(original, updated),
    compile_errors: [],
  };
}

// ── doc_insert_paragraph ───────────────────────────────────────────────────

export interface InsertResult {
  applied: boolean;
  new_line: number;
}

export async function insertParagraph(input: {
  doc_path: string;
  section_id: string;
  paragraph_text: string;
  position: "start" | "end" | number;
}): Promise<InsertResult> {
  const { doc_path, section_id, paragraph_text, position } = input;

  const structure = await getDocumentStructure({ doc_path });
  const section = findSectionById(structure.sections, section_id);
  if (!section) throw new Error(`Section not found: "${section_id}"`);

  const original = fs.readFileSync(doc_path, "utf-8");
  const lines = original.split("\n");

  // Identify content lines (after heading, before line_end)
  const contentStart = section.line_start; // 0-based: first line after heading
  const contentEnd = section.line_end;     // 0-based: exclusive

  let insertAt: number; // 0-based line index to insert before

  if (position === "start") {
    // Insert right after the heading + any immediate blank line
    let idx = contentStart;
    while (idx < contentEnd && lines[idx].trim() === "") idx++;
    insertAt = contentStart; // insert before content, after heading
  } else if (position === "end") {
    // Insert before the next heading (or end of file)
    let idx = contentEnd - 1;
    while (idx > contentStart && lines[idx].trim() === "") idx--;
    insertAt = idx + 1;
  } else {
    // Numeric: find the Nth paragraph boundary (paragraphs separated by blank lines)
    let paragraphCount = 0;
    let idx = contentStart;
    let inParagraph = false;
    insertAt = contentEnd;

    while (idx < contentEnd) {
      if (lines[idx].trim() !== "") {
        if (!inParagraph) {
          inParagraph = true;
          paragraphCount++;
          if (paragraphCount === (position as number)) {
            insertAt = idx;
            break;
          }
        }
      } else {
        inParagraph = false;
      }
      idx++;
    }
  }

  const newLines = [
    ...lines.slice(0, insertAt),
    "",
    paragraph_text,
    ...lines.slice(insertAt),
  ];

  const backup_path = makeBackupPath(doc_path);
  fs.writeFileSync(backup_path, original);
  fs.writeFileSync(doc_path, newLines.join("\n"));

  const compileResult = await compileDocument({ doc_path });
  if (!compileResult.success) {
    fs.writeFileSync(doc_path, original);
    throw new Error(`Insert caused compile errors: ${compileResult.errors[0]?.message}`);
  }

  // Clean up backup on success (insert is low-risk; caller can diff if needed)
  fs.unlinkSync(backup_path);

  return { applied: true, new_line: insertAt + 1 };
}
