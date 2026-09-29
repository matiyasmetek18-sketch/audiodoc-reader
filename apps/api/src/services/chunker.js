import { scoreChunks } from "./textQuality.js";

const DEFAULT_MAX_CHARS = 1600;

export function chunkText(text, maxChars = DEFAULT_MAX_CHARS) {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [text];
  const chunks = [];
  let current = "";
  let startChar = 0;
  let cursor = 0;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    const sentenceStart = text.indexOf(sentence, cursor);
    cursor = sentenceStart + sentence.length;

    if (current && current.length + trimmed.length + 1 > maxChars) {
      const endChar = startChar + current.length;
      chunks.push(buildChunk(chunks.length, current, startChar, endChar));
      current = trimmed;
      startChar = sentenceStart >= 0 ? sentenceStart : endChar;
    } else {
      if (!current) startChar = sentenceStart >= 0 ? sentenceStart : cursor;
      current = current ? `${current} ${trimmed}` : trimmed;
    }

    while (current.length > maxChars * 1.5) {
      const cutAt = findCutPoint(current, maxChars);
      const piece = current.slice(0, cutAt).trim();
      chunks.push(buildChunk(chunks.length, piece, startChar, startChar + piece.length));
      current = current.slice(cutAt).trim();
      startChar += cutAt;
    }
  }

  if (current) chunks.push(buildChunk(chunks.length, current, startChar, startChar + current.length));
  return scoreChunks(chunks);
}

function findCutPoint(text, maxChars) {
  const window = text.slice(0, maxChars);
  const minimumPreferredCut = Math.floor(maxChars * 0.6);
  const punctuationCut = Math.max(
    window.lastIndexOf(","),
    window.lastIndexOf(";"),
    window.lastIndexOf(":"),
    window.lastIndexOf("—")
  );
  const spaceCut = window.lastIndexOf(" ");
  if (punctuationCut >= minimumPreferredCut) return punctuationCut + 1;
  if (spaceCut >= minimumPreferredCut) return spaceCut;
  return Math.floor(maxChars * 0.8);
}

function buildChunk(chunkIndex, text, startChar, endChar) {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return {
    chunkIndex,
    text,
    startChar,
    endChar,
    estimatedSeconds: Math.max(8, (wordCount / 175) * 60)
  };
}
