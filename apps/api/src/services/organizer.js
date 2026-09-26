import { env } from "../config/env.js";
import { getAppSettings } from "../db/repositories.js";

export async function organizeDocument(title, chunks) {
  const fallback = heuristicSections(chunks);
  const settings = getAppSettings();
  if (!settings.openaiApiKey || chunks.length < 4) return fallback;

  try {
    const outline = chunks.map((chunk) => ({
      index: chunk.chunkIndex,
      excerpt: chunk.text.slice(0, 420)
    }));

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: settings.openaiSummaryModel || env.openaiSummaryModel,
        input: [
          {
            role: "system",
            content:
              "You organize extracted PDF text for natural audiobook narration. Return only strict JSON with a sections array. Each section needs title, startChunk, endChunk, and summary. Use natural chapter/topic divisions. Do not invent page numbers."
          },
          {
            role: "user",
            content: JSON.stringify({
              title,
              chunkCount: chunks.length,
              chunks: outline
            })
          }
        ]
      })
    });

    if (!response.ok) return fallback;
    const data = await response.json();
    const parsed = JSON.parse(data.output_text || "{}");
    return normalizeSections(parsed.sections, chunks.length) || fallback;
  } catch {
    return fallback;
  }
}

function heuristicSections(chunks) {
  if (!chunks.length) return [];
  const sections = [];
  let startChunk = 0;
  let title = inferTitle(chunks[0]?.text, 1);
  const targetSize = chunks.length <= 12 ? 4 : 6;

  for (let index = 1; index < chunks.length; index += 1) {
    const candidate = inferHeading(chunks[index].text);
    const enoughDistance = index - startChunk >= 2;
    const oversized = index - startChunk >= targetSize;
    if ((candidate && enoughDistance) || oversized) {
      sections.push(buildSection(sections.length, title, startChunk, index - 1, chunks));
      startChunk = index;
      title = candidate || inferTitle(chunks[index].text, sections.length + 1);
    }
  }

  sections.push(buildSection(sections.length, title, startChunk, chunks.length - 1, chunks));
  return sections;
}

function inferHeading(text) {
  const firstLine = text.split(/\n|\. /)[0]?.trim() || "";
  const compact = firstLine.replace(/[^A-Za-z0-9 ]/g, "").trim();
  if (compact.length < 4 || compact.length > 80) return "";
  const words = compact.split(/\s+/);
  const upperRatio = compact.replace(/[^A-Z]/g, "").length / Math.max(1, compact.replace(/[^A-Za-z]/g, "").length);
  if (/^(chapter|part|section|book)\s+/i.test(compact)) return compact;
  if (words.length <= 9 && upperRatio > 0.65) return titleCase(compact);
  return "";
}

function inferTitle(text, number) {
  const heading = inferHeading(text);
  if (heading) return heading;
  const words = text.replace(/\s+/g, " ").split(" ").filter(Boolean).slice(0, 7).join(" ");
  return words ? titleCase(words.replace(/[^\w' -]/g, "")) : `Section ${number}`;
}

function buildSection(sectionIndex, title, startChunk, endChunk, chunks) {
  const sample = chunks[startChunk]?.text.replace(/\s+/g, " ").slice(0, 180) || "";
  return { sectionIndex, title, startChunk, endChunk, summary: sample };
}

function normalizeSections(input, chunkCount) {
  if (!Array.isArray(input) || !input.length) return null;
  const sections = input
    .map((section, index) => ({
      sectionIndex: index,
      title: String(section.title || `Section ${index + 1}`).slice(0, 90),
      startChunk: clampInt(section.startChunk, 0, chunkCount - 1),
      endChunk: clampInt(section.endChunk, 0, chunkCount - 1),
      summary: String(section.summary || "").slice(0, 260)
    }))
    .filter((section) => section.endChunk >= section.startChunk)
    .sort((a, b) => a.startChunk - b.startChunk);

  let cursor = 0;
  return sections.map((section, index) => {
    const normalized = {
      ...section,
      sectionIndex: index,
      startChunk: cursor,
      endChunk: Math.max(cursor, section.endChunk)
    };
    cursor = Math.min(chunkCount - 1, normalized.endChunk + 1);
    return normalized;
  }).filter((section) => section.startChunk < chunkCount);
}

function clampInt(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function titleCase(value) {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\b(Of|And|The|A|An|In|To|For)\b/g, (word) => word.toLowerCase());
}
