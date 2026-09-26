import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { v4 as uuid } from "uuid";
import { env } from "../config/env.js";
import {
  addBookmark,
  createDocument,
  getChunksForDocument,
  getDocument,
  getDocumentWithChunks,
  listDocuments,
  replaceSectionsForDocument,
  updateProgress
} from "../db/repositories.js";
import { asyncHandler, notFound } from "../utils/errors.js";
import { hashText } from "../utils/hash.js";
import { chunkText } from "../services/chunker.js";
import { parseDocument } from "../services/documentParser.js";
import { countWords } from "../services/textCleaner.js";
import { getOrCreatePodcast } from "../services/podcastService.js";
import { organizeDocument } from "../services/organizer.js";
import { generateAudiobook } from "../services/audioBookService.js";

fs.mkdirSync(env.uploadDir, { recursive: true });

const upload = multer({
  dest: env.uploadDir,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 }
});

export const documentsRouter = Router();

documentsRouter.get("/", (_req, res) => {
  res.json({ documents: listDocuments() });
});

documentsRouter.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      const error = new Error("Upload a file field named 'file'.");
      error.status = 400;
      throw error;
    }

    const id = uuid();
    const safeName = `${id}${path.extname(req.file.originalname)}`;
    const finalPath = path.join(env.uploadDir, safeName);
    await fsp.rename(req.file.path, finalPath);
    req.file.path = finalPath;

    const text = await parseDocument(req.file);
    const wordCount = countWords(text);
    const chunks = chunkText(text);
    const sections = await organizeDocument(
      path.basename(req.file.originalname, path.extname(req.file.originalname)),
      chunks
    );
    const document = createDocument(
      {
        id,
        userId: req.user.id,
        title: path.basename(req.file.originalname, path.extname(req.file.originalname)),
        originalName: req.file.originalname,
        mimeType: req.file.mimetype || "application/octet-stream",
        filePath: finalPath,
        textHash: hashText(text),
        charCount: text.length,
        wordCount,
        estimatedMinutes: Math.max(1, Math.ceil(wordCount / 175))
      },
      chunks,
      sections
    );

    res.status(201).json({ document, chunks, sections });
  })
);

documentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = getDocumentWithChunks(req.params.id);
    if (!result) throw notFound("Document not found.");
    res.json(result);
  })
);

documentsRouter.post(
  "/:id/organize",
  asyncHandler(async (req, res) => {
    const document = getDocument(req.params.id);
    if (!document) throw notFound("Document not found.");
    const chunks = getChunksForDocument(req.params.id).map((chunk) => ({
      chunkIndex: chunk.chunk_index,
      text: chunk.text
    }));
    const sections = await organizeDocument(document.title, chunks);
    const savedSections = replaceSectionsForDocument(req.params.id, sections);
    res.json({ sections: savedSections });
  })
);

documentsRouter.patch(
  "/:id/progress",
  asyncHandler(async (req, res) => {
    const document = getDocument(req.params.id);
    if (!document) throw notFound("Document not found.");
    const currentChunk = Math.max(0, Number(req.body.currentChunk ?? 0));
    const currentOffsetSeconds = Math.max(0, Number(req.body.currentOffsetSeconds ?? 0));
    updateProgress(req.params.id, currentChunk, currentOffsetSeconds);
    res.json({ ok: true });
  })
);

documentsRouter.post(
  "/:id/bookmarks",
  asyncHandler(async (req, res) => {
    const document = getDocument(req.params.id);
    if (!document) throw notFound("Document not found.");
    const bookmark = addBookmark(
      req.params.id,
      Number(req.body.chunkIndex ?? document.current_chunk),
      req.body.label || `Bookmark ${new Date().toLocaleString()}`,
      req.body.note || ""
    );
    res.status(201).json({ bookmark });
  })
);

documentsRouter.post(
  "/:id/audio-download",
  asyncHandler(async (req, res) => {
    const document = getDocument(req.params.id);
    if (!document) throw notFound("Document not found.");
    const result = await generateAudiobook({
      documentId: req.params.id,
      provider: req.body.provider,
      voice: req.body.voice,
      speed: Number(req.body.speed ?? 1),
      pitch: Number(req.body.pitch ?? 0)
    });
    res.json(result);
  })
);

documentsRouter.post(
  "/:id/podcast",
  asyncHandler(async (req, res) => {
    const script = await getOrCreatePodcast(req.params.id);
    res.json({ script, chunks: chunkText(script, 1200) });
  })
);
