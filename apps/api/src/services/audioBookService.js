import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "../config/env.js";
import { getChunksForDocument, getDocument } from "../db/repositories.js";
import { synthesizeChunk } from "./tts/index.js";
import { detectSystemCapabilities } from "./tts/systemCapabilities.js";

const execFileAsync = promisify(execFile);

export async function generateAudiobook({ documentId, provider, voice, speed, pitch }) {
  const document = getDocument(documentId);
  if (!document) {
    const error = new Error("Document not found.");
    error.status = 404;
    throw error;
  }
  if (!provider || provider === "browser") {
    const error = new Error("Downloadable offline audio requires the no-key Local Mac voice, OpenAI, or ElevenLabs. Browser voices cannot be exported.");
    error.status = 400;
    throw error;
  }

  const chunks = getChunksForDocument(documentId);
  const safeVoice = String(voice || "default").replace(/[^a-z0-9_-]/gi, "-");
  if (provider === "system") {
    const capabilities = detectSystemCapabilities();
    if (!capabilities.systemExport) {
      const error = new Error("Local audio-book export requires macOS say and zip. Use OpenAI or ElevenLabs for cross-platform downloads.");
      error.status = 503;
      error.code = "SYSTEM_AUDIO_EXPORT_UNAVAILABLE";
      throw error;
    }
    return generateSystemAudiobook({ document, chunks, voice, speed, pitch, safeVoice, zipPath: capabilities.zipPath });
  }

  const fileName = `${documentId}-${provider}-${safeVoice}-${speed || 1}-${pitch || 0}-full.mp3`;
  const filePath = path.join(env.audioDir, fileName);
  await fsp.mkdir(env.audioDir, { recursive: true });

  const output = fs.createWriteStream(filePath);
  for (const chunk of chunks) {
    const result = await synthesizeChunk({
      documentId,
      chunkIndex: chunk.chunk_index,
      provider,
      voice,
      speed,
      pitch
    });
    const source = result.audio.filePath || result.audio.file_path;
    await pipeFile(source, output);
  }
  output.end();
  await new Promise((resolve, reject) => {
    output.on("finish", resolve);
    output.on("error", reject);
  });

  return {
    fileName,
    filePath,
    downloadUrl: `/api/audio/${fileName}?download=1`,
    chunkCount: chunks.length
  };
}

async function generateSystemAudiobook({ document, chunks, voice, speed, pitch, safeVoice, zipPath }) {
  const fileName = `${document.id}-system-${safeVoice}-${speed || 1}-${pitch || 0}-offline-audio.zip`;
  const filePath = path.join(env.audioDir, fileName);
  const workDir = path.join(os.tmpdir(), `${document.id}-audiodoc-${Date.now()}`);

  await fsp.mkdir(env.audioDir, { recursive: true });
  await fsp.rm(filePath, { force: true });
  await fsp.mkdir(workDir, { recursive: true });
  try {
    const playlist = [];
    for (const chunk of chunks) {
      const result = await synthesizeChunk({
        documentId: document.id,
        chunkIndex: chunk.chunk_index,
        provider: "system",
        voice,
        speed,
        pitch
      });
      const source = result.audio.filePath || result.audio.file_path;
      const partName = `${String(chunk.chunk_index + 1).padStart(4, "0")}.m4a`;
      await fsp.copyFile(source, path.join(workDir, partName));
      playlist.push(partName);
    }
    await fsp.writeFile(
      path.join(workDir, "play-in-order.m3u"),
      ["#EXTM3U", ...playlist].join("\n")
    );
    await execFileAsync(zipPath, ["-q", "-j", filePath, ...playlist.map((name) => path.join(workDir, name)), path.join(workDir, "play-in-order.m3u")], {
      maxBuffer: 1024 * 1024
    });
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true });
  }

  return {
    fileName,
    filePath,
    downloadUrl: `/api/audio/${fileName}?download=1`,
    chunkCount: chunks.length
  };
}

function pipeFile(filePath, output) {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath);
    input.on("error", reject);
    input.on("end", resolve);
    input.pipe(output, { end: false });
  });
}
