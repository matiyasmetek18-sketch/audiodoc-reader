import fs from "node:fs/promises";
import path from "node:path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { cleanExtractedText } from "./textCleaner.js";

const pdfData = pdfParse.default ?? pdfParse;

export async function parseDocument(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  let rawText = "";

  if (file.mimetype === "application/pdf" || extension === ".pdf") {
    const buffer = await fs.readFile(file.path);
    const parsed = await pdfData(buffer);
    rawText = parsed.text;
  } else if (
    file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === ".docx"
  ) {
    const parsed = await mammoth.extractRawText({ path: file.path });
    rawText = parsed.value;
  } else if (file.mimetype.startsWith("text/") || extension === ".txt") {
    rawText = await fs.readFile(file.path, "utf8");
  } else {
    const error = new Error("Unsupported file type. Upload PDF, DOCX, or TXT.");
    error.status = 400;
    throw error;
  }

  const text = cleanExtractedText(rawText);
  if (!text || text.length < 20) {
    const error = new Error("Could not extract enough readable text from this file.");
    error.status = 422;
    throw error;
  }
  return text;
}
