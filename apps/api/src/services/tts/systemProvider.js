import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { detectSystemCapabilities } from "./systemCapabilities.js";

const execFileAsync = promisify(execFile);

export function createSystemProvider(capabilities = detectSystemCapabilities()) {
  return {
    name: "system",
    fileExtension: "m4a",
    available: capabilities.systemVoice,
    async synthesize({ text, voice, speed }) {
      if (!capabilities.systemVoice) {
        const error = new Error("The local system voice provider is unavailable on this machine. Use Browser Web Speech, OpenAI, or ElevenLabs.");
        error.status = 503;
        error.code = "SYSTEM_TTS_UNAVAILABLE";
        throw error;
      }
      const selectedVoice = voice || "Reed (English (US))";
      const rate = Math.round(175 * (Number(speed) || 1));
      const filePath = path.join(os.tmpdir(), `audiodoc-${Date.now()}-${Math.random().toString(16).slice(2)}.m4a`);
      await execFileAsync(capabilities.sayPath, ["-v", selectedVoice, "-r", String(rate), "-o", filePath, text], {
        maxBuffer: 1024 * 1024
      });
      try {
        return await fs.readFile(filePath);
      } finally {
        await fs.rm(filePath, { force: true });
      }
    }
  };
}
