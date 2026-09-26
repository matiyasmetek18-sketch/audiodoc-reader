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

const systemCapabilities = detectSystemCapabilities();
const providers = {
  system: createSystemProvider(systemCapabilities),
  browser: createBrowserProvider(),
  openai: createOpenAiProvider(env),
  elevenlabs: createElevenLabsProvider(env)
};

export function getTtsProvider(provider = env.ttsProvider) {
  if (provider === "system" && !systemCapabilities.systemVoice) return providers.browser;
  return providers[provider] ?? providers.browser;
}

export function getTtsCapabilities() {
  return {
    platform: systemCapabilities.platform,
    systemVoice: systemCapabilities.systemVoice,
    systemExport: systemCapabilities.systemExport,
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

  const buffer = await activeProvider.synthesize({
    text: chunk.text,
    voice: normalizedVoice,
    speed: Number(speed),
    pitch: Number(pitch),
    settings
  });

  await fs.mkdir(env.audioDir, { recursive: true });
  const extension = activeProvider.fileExtension || "mp3";
  const fileName = `${documentId}-${chunkIndex}-${activeProvider.name}-${textHash.slice(0, 12)}.${extension}`;
  const filePath = path.join(env.audioDir, fileName);
  await fs.writeFile(filePath, buffer);

  const audio = {
    ...cacheInput,
    filePath,
    byteLength: buffer.byteLength,
    durationSeconds: chunk.estimated_seconds / Number(speed || 1)
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
