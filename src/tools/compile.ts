import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const execFileAsync = promisify(execFile);

export interface CompileError {
  message: string;
  source_file: string;
  line: number;
  column: number;
  severity: "error" | "warning";
}

export interface CompileResult {
  success: boolean;
  pdf_path: string;
  errors: CompileError[];
  compile_time_ms: number;
}

function parseTypstErrors(stderr: string, docPath: string): CompileError[] {
  const errors: CompileError[] = [];
  // Typst error format: "error: message\n  --> file:line:col"
  const errorBlock = /^(error|warning):\s*(.+?)(?:\n\s+-->\s+(.+?):(\d+):(\d+))?$/gm;
  let match;
  while ((match = errorBlock.exec(stderr)) !== null) {
    errors.push({
      severity: match[1] as "error" | "warning",
      message: match[2].trim(),
      source_file: match[3] ?? docPath,
      line: match[4] ? parseInt(match[4], 10) : 0,
      column: match[5] ? parseInt(match[5], 10) : 0,
    });
  }
  return errors;
}

export async function compileDocument(input: {
  doc_path: string;
  engine?: "typst" | "tectonic" | "pdflatex";
  draft?: boolean;
}): Promise<CompileResult> {
  const { doc_path } = input;
  const ext = path.extname(doc_path).toLowerCase();

  if (ext !== ".typ") {
    if (ext === ".tex") {
      // TODO: implement LaTeX via tectonic
      throw new Error("LaTeX compilation not yet implemented (Phase 2)");
    }
    throw new Error(`Unsupported file extension: ${ext}`);
  }

  const pdf_path = path.join(os.tmpdir(), `doc-mcp-${Date.now()}.pdf`);
  const start = Date.now();

  try {
    await execFileAsync("typst", ["compile", doc_path, pdf_path]);
    return {
      success: true,
      pdf_path,
      errors: [],
      compile_time_ms: Date.now() - start,
    };
  } catch (err: unknown) {
    const execErr = err as { stderr?: string; stdout?: string };
    const stderr = execErr.stderr ?? "";
    const errors = parseTypstErrors(stderr, doc_path);
    // Clean up failed pdf if it exists
    if (fs.existsSync(pdf_path)) fs.unlinkSync(pdf_path);
    return {
      success: false,
      pdf_path: "",
      errors: errors.length > 0 ? errors : [{ message: stderr || "Unknown error", source_file: doc_path, line: 0, column: 0, severity: "error" }],
      compile_time_ms: Date.now() - start,
    };
  }
}
