import fs from "node:fs";
import { fileURLToPath } from "node:url";

const wordListPath = fileURLToPath(new URL("../data/english-words.txt", import.meta.url));
const dictionary = new Set(
  fs.readFileSync(wordListPath, "utf8")
    .split(/\r?\n/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => /^[a-z]{2,}$/.test(word))
);

const commonWords = new Set("a about after again all also an and any are as at be because been before but by can could did do does for from get had has have he her him his how i if in into is it its just like may me more most much my no not of on one only or other our out over said say she should so some than that the their them then there these they this those through to too up use was we were what when where which who will with would you your".split(" "));

const frontMatterPattern = /\b(?:copyright|all rights reserved|isbn|library of congress|praise for|table of contents|published by|printed in|title page)\b/i;
const backMatterPattern = /\b(?:about the author|also by|other books|more books|advertisement|available now|look for|visit us|coming soon)\b/i;
const isbnPattern = /\bISBN(?:-1[03])?\b[^\n]{0,50}\d[\d\s-]{6,}/i;

export function scoreChunks(chunks) {
  return chunks.map((chunk, index) => ({
    ...chunk,
    ...scoreChunkQuality(chunk.text, { chunkIndex: index, chunkCount: chunks.length })
  }));
}

export function scoreChunkQuality(text, { chunkIndex = 0, chunkCount = 1 } = {}) {
  const source = String(text || "").trim();
  const tokens = source.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
  const normalizedTokens = tokens.map((token) => token.toLowerCase().replace(/[’']/g, "").replace(/-/g, ""));
  const meaningfulTokens = normalizedTokens.filter((token) => token.length > 1);
  const validWords = meaningfulTokens.filter((token) => isDictionaryWord(token) || commonWords.has(token));
  const wordValidity = meaningfulTokens.length ? validWords.length / meaningfulTokens.length : 0;
  const visibleLength = Math.max(1, source.replace(/\s/g, "").length);
  const digitRatio = ratio(source, /\d/g, visibleLength);
  const uppercaseRatio = ratio(source, /[A-Z]/g, Math.max(1, source.replace(/[^A-Za-z]/g, "").length));
  const punctuationRatio = ratio(source, /[^\w\s]/g, visibleLength);
  const nonAlphaNumericRatio = ratio(source, /[^A-Za-z0-9\s]/g, visibleLength);
  const sentenceCount = Math.max(1, (source.match(/[.!?]+(?=\s|$)/g) || []).length);
  const averageSentenceLength = meaningfulTokens.length / sentenceCount;
  const fragments = tokens.filter((token) => isFragment(token));
  const fragmentDensity = tokens.length ? fragments.length / tokens.length : 1;
  const edgeChunk = chunkIndex < 3 || chunkIndex >= Math.max(0, chunkCount - 3);
  const frontMatter = frontMatterPattern.test(source);
  const backMatter = backMatterPattern.test(source);
  const reasons = [];
  let score = 1;

  if (wordValidity < 0.6) {
    score -= Math.min(0.42, (0.6 - wordValidity) * 0.8);
    reasons.push(`low dictionary validity (${Math.round(wordValidity * 100)}%)`);
  }
  if (digitRatio > 0.12) {
    score -= Math.min(0.2, digitRatio * 0.7);
    reasons.push("high digit density");
  }
  if (uppercaseRatio > 0.38 && meaningfulTokens.length > 3) {
    score -= 0.16;
    reasons.push("unusually high uppercase density");
  }
  if (punctuationRatio > 0.22 || nonAlphaNumericRatio > 0.26) {
    score -= 0.18;
    reasons.push("unusually high punctuation or symbol density");
  }
  if (fragmentDensity > 0.16) {
    score -= Math.min(0.3, fragmentDensity * 0.8);
    reasons.push("broken word fragments");
  }
  if (isbnPattern.test(source)) {
    score -= 0.65;
    reasons.push("ISBN/catalog block");
  }
  if (frontMatter || backMatter) {
    score -= edgeChunk ? 0.3 : 0.16;
    reasons.push(frontMatter ? "front matter language" : "back matter or advertising language");
  } else if (edgeChunk && (wordValidity < 0.72 || fragmentDensity > 0.08 || digitRatio > 0.06)) {
    score -= 0.1;
    reasons.push("low-confidence edge matter");
  }
  if (averageSentenceLength < 2 && meaningfulTokens.length > 5) {
    score -= 0.12;
    reasons.push("fragmentary sentence structure");
  }

  const qualityScore = Math.max(0, Math.min(1, Number(score.toFixed(3))));
  return {
    quality_score: qualityScore,
    quality_status: qualityScore < 0.55 ? "low" : qualityScore < 0.72 ? "review" : "ok",
    quality_reasons: reasons
  };
}

function isDictionaryWord(token) {
  if (dictionary.has(token)) return true;
  if (token.length > 4 && (dictionary.has(token.slice(0, -1)) || dictionary.has(token.slice(0, -2)))) return true;
  return false;
}

function isFragment(token) {
  const normalized = token.replace(/[’'-]/g, "");
  if (normalized.length < 2) return false;
  if (/^[A-Z]{2,6}$/.test(token) && !commonWords.has(normalized.toLowerCase())) return true;
  if (normalized.length >= 3 && !/[aeiouy]/i.test(normalized)) return true;
  if (/[A-Za-z][,.;:][A-Za-z]/.test(token)) return true;
  return false;
}

function ratio(text, pattern, denominator) {
  return (text.match(pattern) || []).length / denominator;
}
