import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createKokoroProvider } from "../src/services/tts/kokoroProvider.js";

const sampleDir = path.join(os.tmpdir(), "audiodoc-kokoro-samples");
const provider = createKokoroProvider();
const base = "The reader moves through a clear paragraph with natural pauses, careful punctuation, and a steady conversational rhythm. ";

await fs.mkdir(sampleDir, { recursive: true });

const results = [];
for (const targetSeconds of [10, 30, 120]) {
  const text = makeText(targetSeconds * 2.5);
  const before = process.memoryUsage();
  const started = performance.now();
  const buffer = await provider.synthesize({ text, voice: "af_heart", speed: 1 });
  const elapsedMs = performance.now() - started;
  const after = process.memoryUsage();
  const outputPath = path.join(sampleDir, `kokoro-${targetSeconds}s.wav`);
  await fs.writeFile(outputPath, buffer);
  const audioSeconds = wavDurationSeconds(buffer);
  results.push({
    targetSeconds,
    inputWords: text.split(/\s+/).length,
    audioSeconds: Number(audioSeconds.toFixed(3)),
    wallSeconds: Number((elapsedMs / 1000).toFixed(3)),
    realtimeFactor: Number((elapsedMs / 1000 / audioSeconds).toFixed(3)),
    rssBeforeMb: Number((before.rss / 1024 / 1024).toFixed(1)),
    rssAfterMb: Number((after.rss / 1024 / 1024).toFixed(1)),
    heapUsedAfterMb: Number((after.heapUsed / 1024 / 1024).toFixed(1)),
    outputPath
  });
}

console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, results }, null, 2));

function makeText(targetWords) {
  let text = "";
  while (text.split(/\s+/).filter(Boolean).length < targetWords) text += base;
  return text.trim();
}

function wavDurationSeconds(buffer) {
  const sampleRate = buffer.readUInt32LE(24);
  const channels = buffer.readUInt16LE(22);
  const bitsPerSample = buffer.readUInt16LE(34);
  const dataOffset = buffer.indexOf(Buffer.from("data"));
  const dataBytes = dataOffset >= 0 ? buffer.readUInt32LE(dataOffset + 4) : buffer.length - 44;
  return dataBytes / (sampleRate * channels * (bitsPerSample / 8));
}
