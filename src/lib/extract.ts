import mammoth from "mammoth";
import { extname } from "node:path";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

/**
 * Below this, treat extraction as failed rather than scoring a near-empty
 * state. A scanned or image-only PDF lands here, and surfacing that beats
 * silently ranking a good candidate last.
 */
export const MIN_USABLE_CHARS = 200;

export interface Extraction {
  text: string;
  charCount: number;
  status: "ok" | "failed";
  error?: string;
  /** Best-effort candidate name; falls back to the file name. */
  name: string;
}

export async function extractResume(buffer: Buffer, fileName: string): Promise<Extraction> {
  const ext = extname(fileName).toLowerCase();
  try {
    const raw = await extractByType(buffer, ext);
    const text = tidy(raw);
    if (text.length < MIN_USABLE_CHARS) {
      return {
        text,
        charCount: text.length,
        status: "failed",
        error: `Extracted only ${text.length} characters (minimum ${MIN_USABLE_CHARS}). Likely a scanned or image-only file.`,
        name: guessName(text, fileName),
      };
    }
    return { text, charCount: text.length, status: "ok", name: guessName(text, fileName) };
  } catch (cause) {
    return {
      text: "",
      charCount: 0,
      status: "failed",
      error: cause instanceof Error ? cause.message : String(cause),
      name: fallbackName(fileName),
    };
  }
}

async function extractByType(buffer: Buffer, ext: string): Promise<string> {
  switch (ext) {
    case ".pdf": {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractPdfText(pdf, { mergePages: true });
      return Array.isArray(text) ? text.join("\n") : text;
    }
    case ".docx": {
      const { value } = await mammoth.extractRawText({ buffer });
      return value;
    }
    case ".txt":
    case ".md":
      return buffer.toString("utf8");
    default:
      throw new Error(`Unsupported file type "${ext || "unknown"}". Use PDF, DOCX, TXT or MD.`);
  }
}

/** Collapse the ragged whitespace PDF extraction produces, keeping line structure. */
function tidy(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\t   ]/g, " ")
    .split("\n")
    .map((l) => l.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const NAME_LINE = /^[A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){1,3}$/u;

function guessName(text: string, fileName: string): string {
  for (const line of text.split("\n").slice(0, 8)) {
    const candidate = line.trim();
    if (candidate.length < 4 || candidate.length > 48) continue;
    if (/\d|@|https?:/.test(candidate)) continue;
    if (NAME_LINE.test(candidate)) return candidate;
  }
  return fallbackName(fileName);
}

function fallbackName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || fileName;
}
