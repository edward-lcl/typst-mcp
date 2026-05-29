import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface TraceEvent {
  ts: string;
  session_id: string;
  context: string;
  tool: string;
  doc_path: string;
  success: boolean;
  duration_ms: number;
  summary: string;
  inputs?: Record<string, unknown>;
  error?: string;
}

export interface Tracer {
  emit(event: Omit<TraceEvent, "ts" | "session_id" | "context">): Promise<void>;
  sessionId: string;
  context: string;
}

export function createTracer(config: {
  tracePath: string;
  context: string;
  sessionId?: string;
}): Tracer {
  const sessionId = config.sessionId ?? crypto.randomUUID().slice(0, 8);

  fs.mkdirSync(path.dirname(config.tracePath), { recursive: true });

  return {
    sessionId,
    context: config.context,
    async emit(partial) {
      const event: TraceEvent = {
        ts: new Date().toISOString(),
        session_id: sessionId,
        context: config.context,
        ...partial,
      };
      fs.appendFileSync(config.tracePath, JSON.stringify(event) + "\n");
    },
  };
}

export function defaultTracePath(): string {
  const date = new Date().toISOString().slice(0, 10);
  const base = process.env.DOC_MCP_TRACE_DIR
    ?? process.env.OCPLATFORM_WORKSPACE
    ?? `${process.env.HOME}/.ocplatform/workspace`;
  return path.join(base, "ontology", "traces", `document-mcp-${date}.jsonl`);
}

export function defaultContext(): string {
  return process.env.DOC_MCP_CONTEXT ?? "default";
}
