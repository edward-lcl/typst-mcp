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

  if (ext === ".typ") {
    return compileTypst(doc_path);
  } else if (ext === ".tex") {
    return compileTectonic(doc_path);
  } else {
    throw new Error(`Unsupported file extension: ${ext}`);
  }
}

async function compileTypst(doc_path: string): Promise<CompileResult> {
  const pdf_path = path.join(os.tmpdir(), `doc-mcp-${Date.now()}.pdf`);
  const start = Date.now();
  try {
    await execFileAsync("typst", ["compile", doc_path, pdf_path]);
    return { success: true, pdf_path, errors: [], compile_time_ms: Date.now() - start };
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr ?? "";
    const errors = parseTypstErrors(stderr, doc_path);
    if (fs.existsSync(pdf_path)) fs.unlinkSync(pdf_path);
    return {
      success: false, pdf_path: "",
      errors: errors.length > 0 ? errors : [{ message: stderr || "Unknown error", source_file: doc_path, line: 0, column: 0, severity: "error" }],
      compile_time_ms: Date.now() - start,
    };
  }
}

function parseTectonicErrors(stderr: string, docPath: string): CompileError[] {
  const errors: CompileError[] = [];
  // Tectonic format: "error[EXXX]: message" or "filename.tex:LINE: message"
  const lineErr = /^([^:]+\.tex):([0-9]+):\s*(.+)$/gm;
  let match;
  while ((match = lineErr.exec(stderr)) !== null) {
    errors.push({ severity: "error", message: match[3].trim(), source_file: match[1], line: parseInt(match[2], 10), column: 0 });
  }
  if (errors.length === 0 && stderr.includes("error")) {
    errors.push({ severity: "error", message: stderr.split("\n")[0] ?? "Unknown error", source_file: docPath, line: 0, column: 0 });
  }
  return errors;
}

async function compileTectonic(doc_path: string): Promise<CompileResult> {
  const dir = path.dirname(doc_path);
  const start = Date.now();
  try {
    const { stderr } = await execFileAsync("tectonic", ["--keep-logs", "-Z", "shell-escape-cwd=.", doc_path], { cwd: dir }).catch((e) => e);
    // Tectonic writes the PDF alongside the source file
    const pdf_path = doc_path.replace(/\.tex$/, ".pdf");
    if (fs.existsSync(pdf_path)) {
      return { success: true, pdf_path, errors: [], compile_time_ms: Date.now() - start };
    }
    // Compile failed
    const errors = parseTectonicErrors(stderr ?? "", doc_path);
    return { success: false, pdf_path: "", errors, compile_time_ms: Date.now() - start };
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr ?? "";
    return {
      success: false, pdf_path: "",
      errors: parseTectonicErrors(stderr, doc_path),
      compile_time_ms: Date.now() - start,
    };
  }
}
