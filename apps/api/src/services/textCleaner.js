export function cleanExtractedText(rawText) {
  const normalized = rawText
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/-\n(?=[a-z])/g, "")
    .replace(/\n{3,}/g, "\n\n");

  const lines = normalized.split("\n").map((line) => line.trim());
  const frequency = new Map();
  for (const line of lines) {
    if (line.length > 4 && line.length < 90) frequency.set(line, (frequency.get(line) ?? 0) + 1);
  }

  const repeated = new Set(
    [...frequency.entries()]
      .filter(([, count]) => count >= 4)
      .map(([line]) => line)
  );

  return lines
    .filter((line) => !repeated.has(line))
    .filter((line) => !/^\s*\d+\s*$/.test(line))
    .join("\n")
    .replace(/([^\n])\n([^\n])/g, "$1 $2")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}
