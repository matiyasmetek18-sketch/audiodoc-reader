import { env } from "../config/env.js";
import { getAppSettings, getDocumentWithChunks, getPodcastScript, savePodcastScript } from "../db/repositories.js";

export async function getOrCreatePodcast(documentId) {
  const cached = getPodcastScript(documentId);
  if (cached) return cached.script;

  const bundle = getDocumentWithChunks(documentId);
  if (!bundle) {
    const error = new Error("Document not found.");
    error.status = 404;
    throw error;
  }

  const source = bundle.chunks
    .slice(0, 20)
    .map((chunk) => chunk.text)
    .join("\n\n")
    .slice(0, 24000);

  const settings = getAppSettings();
  const script = settings.openaiApiKey
    ? await generateWithOpenAI(bundle.document.title, source, settings)
    : generateLocalFallback(bundle.document.title, source);

  savePodcastScript(documentId, script);
  return script;
}

async function generateWithOpenAI(title, source, settings) {
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
            "Create a concise podcast script between HOST_A and HOST_B. HOST_A is warm and deep-voiced; HOST_B is curious and calm. Focus on useful ideas, not hype."
        },
        {
          role: "user",
          content: `Title: ${title}\n\nDocument excerpt:\n${source}\n\nReturn 8-12 conversational turns.`
        }
      ]
    })
  });

  if (!response.ok) {
    const error = new Error(`OpenAI summary request failed: ${response.status} ${await response.text()}`);
    error.status = 502;
    throw error;
  }

  const data = await response.json();
  return data.output_text ?? generateLocalFallback(title, source);
}

function generateLocalFallback(title, source) {
  const firstSentences = (source.match(/[^.!?]+[.!?]+/g) ?? [source]).slice(0, 10);
  const summary = firstSentences.join(" ").slice(0, 2200);
  return [
    `HOST_A: Today we're unpacking ${title}. The core material starts with this idea: ${summary}`,
    "HOST_B: I like that. The practical question is what a listener should remember after closing the document.",
    "HOST_A: The big move is to turn the dense material into a few concrete claims, then revisit the source for evidence.",
    "HOST_B: So this is a guided overview rather than a replacement for the full read.",
    "HOST_A: Exactly. Use it to orient yourself, then jump back into the highlighted sections that matter most."
  ].join("\n\n");
}
