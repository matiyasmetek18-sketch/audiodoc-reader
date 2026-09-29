import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { env } from "../../config/env.js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const MODEL_FILES = [
  { remote: "config.json", local: "config.json" },
  { remote: "tokenizer.json", local: "tokenizer.json" },
  { remote: "tokenizer_config.json", local: "tokenizer_config.json" },
  // Keep the requested q8f16 artifact; Transformers.js reads the compatibility alias below.
  { remote: "onnx/model_q8f16.onnx", local: "onnx/model_q8f16.onnx" }
];
const TRANSFORMERS_MODEL_PATH = path.join("onnx", "model_quantized.onnx");
const MODEL_BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/main/`;
const DEFAULT_VOICE = "af_heart";
const RECOMMENDED_VOICES = ["af_heart", "af_bella", "am_michael"];

let modelPromise = null;
let modelInstance = null;

export function createKokoroProvider() {
  return {
    name: "kokoro",
    fileExtension: "wav",
    available: isKokoroModelDownloaded(),
    async synthesize({ text, voice, speed }) {
      try {
        const { tts, TextSplitterStream } = await loadKokoro();
        const splitter = new TextSplitterStream();
        const stream = tts.stream(splitter, { voice: voice || DEFAULT_VOICE, speed: Number(speed) || 1 });
        splitter.push(text);
        splitter.close();
        const segments = [];
        for await (const segment of stream) {
          segments.push(Buffer.from(segment.audio.toWav()));
        }
        if (!segments.length) throw new Error("Kokoro produced no audio for this text.");
        return mergeWavBuffers(segments);
      } catch (error) {
        error.status = 503;
        error.code = "KOKORO_UNAVAILABLE";
        throw error;
      }
    }
  };
}

export function getKokoroCapabilities() {
  const modelDownloaded = isKokoroModelDownloaded();
  return {
    available: modelDownloaded,
    modelDownloaded,
    modelLocation: "storage/models/kokoro",
    modelId: MODEL_ID,
    downloadRequired: !modelDownloaded,
    voices: RECOMMENDED_VOICES
  };
}

export function isKokoroModelDownloaded() {
  return MODEL_FILES.every(({ local }) => fsSync.existsSync(path.join(env.kokoroModelDir, local)))
    && fsSync.existsSync(path.join(env.kokoroModelDir, TRANSFORMERS_MODEL_PATH));
}

async function loadKokoro() {
  if (modelInstance) return modelInstance;
  if (!modelPromise) {
    modelPromise = (async () => {
      await ensureModelDownloaded();
      const { KokoroTTS, TextSplitterStream } = await import("kokoro-js");
      const tts = await KokoroTTS.from_pretrained(env.kokoroModelDir, { dtype: "q8", device: "cpu" });
      return { tts, TextSplitterStream };
    })();
  }

  try {
    modelInstance = await modelPromise;
    return modelInstance;
  } catch (error) {
    modelPromise = null;
    throw error;
  }
}

async function ensureModelDownloaded() {
  if (isKokoroModelDownloaded()) return;
  await fs.mkdir(env.kokoroModelDir, { recursive: true });

  for (const file of MODEL_FILES) {
    const destination = path.join(env.kokoroModelDir, file.local);
    if (fsSync.existsSync(destination)) continue;
    await downloadFile(`${MODEL_BASE_URL}${file.remote}`, destination);
  }
  await ensureTransformersModelAlias();
}

async function ensureTransformersModelAlias() {
  const source = path.join(env.kokoroModelDir, "onnx", "model_q8f16.onnx");
  const alias = path.join(env.kokoroModelDir, TRANSFORMERS_MODEL_PATH);
  if (fsSync.existsSync(alias)) return;
  try {
    await fs.symlink("model_q8f16.onnx", alias);
  } catch {
    // Symlinks may be restricted on Windows; fall back to a copy there.
    await fs.copyFile(source, alias);
  }
}

async function downloadFile(url, destination) {
  const temporary = `${destination}.partial`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Kokoro model download failed (${response.status}) for ${url}`);
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    const fileHandle = await fs.open(temporary, "w");
    try {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await fileHandle.write(value);
      }
    } finally {
      await fileHandle.close();
    }
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

function mergeWavBuffers(wavBuffers) {
  const first = wavBuffers[0];
  const dataChunks = wavBuffers.map((buffer) => {
    const dataOffset = buffer.indexOf(Buffer.from("data"));
    if (dataOffset < 0) throw new Error("Kokoro returned an invalid WAV segment.");
    return buffer.subarray(dataOffset + 8, dataOffset + 8 + buffer.readUInt32LE(dataOffset + 4));
  });
  const dataLength = dataChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = Buffer.alloc(first.length - dataChunks[0].length + dataLength);
  first.copy(output, 0, 0, first.length - dataChunks[0].length);
  let offset = first.length - dataChunks[0].length;
  for (const chunk of dataChunks) {
    chunk.copy(output, offset);
    offset += chunk.length;
  }
  output.writeUInt32LE(36 + dataLength, 4);
  const dataOffset = output.indexOf(Buffer.from("data"));
  output.writeUInt32LE(dataLength, dataOffset + 4);
  return output;
}
