import path from "node:path";
import fs from "node:fs";
import { Router } from "express";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/errors.js";
import { synthesizeChunk, synthesizeText } from "../services/tts/index.js";

export const ttsRouter = Router();

ttsRouter.post(
  "/chunk",
  asyncHandler(async (req, res) => {
    const result = await synthesizeChunk({
      documentId: req.body.documentId,
      chunkIndex: Number(req.body.chunkIndex ?? 0),
      provider: req.body.provider,
      voice: req.body.voice,
      speed: Number(req.body.speed ?? 1),
      pitch: Number(req.body.pitch ?? 0)
    });

    res.json({
      cached: result.cached,
      shared: result.shared || false,
      chunkIndex: result.chunk.chunk_index,
      audioUrl: `/api/audio/${path.basename(result.audio.filePath || result.audio.file_path)}`,
      durationSeconds: result.audio.durationSeconds || result.audio.duration_seconds
    });
  })
);

export const audioRouter = Router();

ttsRouter.post(
  "/text",
  asyncHandler(async (req, res) => {
    const text = String(req.body.text || "").trim();
    if (!text) {
      const error = new Error("Text is required.");
      error.status = 422;
      throw error;
    }
    const result = await synthesizeText({
      text,
      voice: req.body.voice || "af_heart",
      speed: Number(req.body.speed ?? 1),
      pitch: Number(req.body.pitch ?? 0)
    });
    const fileName = `kokoro-text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
    await fs.promises.mkdir(env.audioDir, { recursive: true });
    await fs.promises.writeFile(path.join(env.audioDir, fileName), result.buffer);
    res.json({ audioUrl: `/api/audio/${fileName}`, durationSeconds: null });
  })
);

audioRouter.get(
  "/:file",
  asyncHandler(async (req, res) => {
    const filePath = path.join(env.audioDir, path.basename(req.params.file));
    if (!fs.existsSync(filePath)) {
      const error = new Error("Audio file not found.");
      error.status = 404;
      throw error;
    }
    if (req.query.download === "1") {
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
    }
    res.sendFile(filePath);
  })
);
