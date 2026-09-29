import fsp from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { getChunksForDocument, getDocument } from "../db/repositories.js";
import { synthesizeChunk } from "./tts/index.js";

export async function generateAudiobook({ documentId, voice, speed, pitch }) {
  const document = getDocument(documentId);
  if (!document) {
    const error = new Error("Document not found.");
    error.status = 404;
    throw error;
  }
  const chunks = getChunksForDocument(documentId);
  const safeVoice = String(voice || "af_heart").replace(/[^a-z0-9_-]/gi, "-");
  const fileName = `${documentId}-kokoro-${safeVoice}-${speed || 1}-${pitch || 0}-full.wav`;
  const filePath = path.join(env.audioDir, fileName);
  await fsp.mkdir(env.audioDir, { recursive: true });
  const buffers = [];
  for (const chunk of chunks) {
    const result = await synthesizeChunk({ documentId, chunkIndex: chunk.chunk_index, voice, speed, pitch });
    buffers.push(await fsp.readFile(result.audio.filePath || result.audio.file_path));
  }
  await fsp.writeFile(filePath, mergeWavBuffers(buffers));
  return { fileName, filePath, downloadUrl: `/api/audio/${fileName}?download=1`, chunkCount: chunks.length };
}

function mergeWavBuffers(buffers) {
  if (!buffers.length) return Buffer.alloc(0);
  const header = Buffer.from(buffers[0].subarray(0, 44));
  const pcm = Buffer.concat(buffers.map((buffer) => buffer.subarray(44)));
  header.writeUInt32LE(36 + pcm.length, 4);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
