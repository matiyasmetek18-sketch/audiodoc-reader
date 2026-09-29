import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { findAudioCache, findChunk, getAppSettings, saveAudioCache } from "../../db/repositories.js";
import { hashText } from "../../utils/hash.js";
import { createBrowserProvider } from "./browserProvider.js";
import { createOpenAiProvider } from "./openaiProvider.js";
import { createElevenLabsProvider } from "./elevenLabsProvider.js";
import { createSystemProvider } from "./systemProvider.js";
import { detectSystemCapabilities } from "./systemCapabilities.js";
import { createTestProvider } from "./testProvider.js";

const systemCapabilities = detectSystemCapabilities();
const providers = {
  system: createSystemProvider(systemCapabilities),
  browser: createBrowserProvider(),
  openai: createOpenAiProvider(env),
  elevenlabs: createElevenLabsProvider(env),
  test: createTestProvider()
};
const inFlightSynthesis = new Map();

export function getTtsProvider(provider = env.ttsProvider) {
  if (provider === "test" && env.nodeEnv !== "test") return providers.browser;
  if (provider === "system" && !systemCapabilities.systemVoice) return providers.browser;
  return providers[provider] ?? providers.browser;
}

export function getTtsCapabilities() {
  return {
    platform: systemCapabilities.platform,
    systemVoice: systemCapabilities.systemVoice,
    systemExport: systemCapabilities.systemExport,
    systemVoices: systemCapabilities.systemVoices,
    providers: {
      browser: true,
      openai: true,
      elevenlabs: true,
      system: systemCapabilities.systemVoice
    }
  };
}

export async function synthesizeChunk({ documentId, chunkIndex, provider, voice, speed = 1, pitch = 0 }) {
  const settings = getAppSettings();
  const chunk = findChunk(documentId, chunkIndex);
  if (!chunk) {
    const error = new Error("Chunk not found.");
    error.status = 404;
    throw error;
  }

  const activeProvider = getTtsProvider(provider || settings.ttsProvider);
  const normalizedVoice = voice || defaultVoice(activeProvider.name, settings);
  const textHash = hashText(`${chunk.text}:${normalizedVoice}:${speed}:${pitch}`);
  const cacheInput = {
    documentId,
    chunkIndex,
    provider: activeProvider.name,
    voice: normalizedVoice,
    speed: Number(speed),
    pitch: Number(pitch),
    textHash
  };

  const cached = findAudioCache(cacheInput);
  if (cached) return { cached: true, chunk, audio: cached };

  const cacheKey = JSON.stringify(cacheInput);
  const existingSynthesis = inFlightSynthesis.get(cacheKey);
  if (existingSynthesis) {
    const result = await existingSynthesis;
    return { ...result, shared: true };
  }

  const synthesis = synthesizeAndCache({ chunk, activeProvider, normalizedVoice, settings, cacheInput });
  inFlightSynthesis.set(cacheKey, synthesis);
  try {
    return await synthesis;
  } finally {
    if (inFlightSynthesis.get(cacheKey) === synthesis) inFlightSynthesis.delete(cacheKey);
  }
}

async function synthesizeAndCache({ chunk, activeProvider, normalizedVoice, settings, cacheInput }) {
  const buffer = await activeProvider.synthesize({
    text: chunk.text,
    voice: normalizedVoice,
    speed: cacheInput.speed,
    pitch: cacheInput.pitch,
    settings
  });

  await fs.mkdir(env.audioDir, { recursive: true });
  const extension = activeProvider.fileExtension || "mp3";
  const fileName = `${cacheInput.documentId}-${cacheInput.chunkIndex}-${activeProvider.name}-${cacheInput.textHash.slice(0, 12)}.${extension}`;
  const filePath = path.join(env.audioDir, fileName);
  await fs.writeFile(filePath, buffer);

  const audio = {
    ...cacheInput,
    filePath,
    byteLength: buffer.byteLength,
    durationSeconds: chunk.estimated_seconds / Number(cacheInput.speed || 1)
  };
  saveAudioCache(audio);
  return { cached: false, chunk, audio };
}

function defaultVoice(provider, settings) {
  if (provider === "openai") return settings.openaiTtsVoice || env.openaiTtsVoice;
  if (provider === "elevenlabs") return settings.elevenLabsVoiceId || env.elevenLabsVoiceId || "deep-calm";
  if (provider === "system") return settings.systemVoice || "Reed (English (US))";
  return "browser-deep";
}
