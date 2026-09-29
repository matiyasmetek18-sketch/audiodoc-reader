import { v4 as uuid } from "uuid";
import { env } from "../config/env.js";
import { openDatabase } from "./schema.js";
import { scoreChunkQuality } from "../services/textQuality.js";

export const DEMO_USER_ID = "local-demo-user";

const db = openDatabase(env.databasePath);

export function ensureDemoUser(email = "reader@example.com") {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(DEMO_USER_ID);
  if (existing) return existing;
  const user = { id: DEMO_USER_ID, email, name: "Local Reader", created_at: new Date().toISOString() };
  db.prepare("INSERT INTO users (id, email, name, created_at) VALUES (@id, @email, @name, @created_at)").run(user);
  return user;
}

export function createDocument(doc, chunks, sections = []) {
  const now = new Date().toISOString();
  const document = toDbDocument({ ...doc, created_at: now, updated_at: now });
  const insertDocument = db.prepare(`
    INSERT INTO documents (
      id, user_id, title, original_name, mime_type, file_path, text_hash,
      char_count, word_count, estimated_minutes, current_chunk,
      current_offset_seconds, created_at, updated_at
    ) VALUES (
      @id, @user_id, @title, @original_name, @mime_type, @file_path, @text_hash,
      @char_count, @word_count, @estimated_minutes, @current_chunk,
      @current_offset_seconds, @created_at, @updated_at
    )
  `);
  const insertChunk = db.prepare(`
    INSERT INTO chunks (id, document_id, chunk_index, text, start_char, end_char, estimated_seconds, quality_score, quality_status, quality_reasons)
    VALUES (@id, @document_id, @chunk_index, @text, @start_char, @end_char, @estimated_seconds, @quality_score, @quality_status, @quality_reasons)
  `);
  const insertSection = db.prepare(`
    INSERT INTO sections (id, document_id, section_index, title, start_chunk, end_chunk, summary)
    VALUES (@id, @document_id, @section_index, @title, @start_chunk, @end_chunk, @summary)
  `);

  db.transaction(() => {
    insertDocument.run(document);
    for (const chunk of chunks) insertChunk.run(toDbChunk({ id: uuid(), documentId: doc.id, ...chunk }));
    for (const section of sections) insertSection.run(toDbSection({ id: uuid(), documentId: doc.id, ...section }));
  })();
  return getDocument(doc.id);
}

export function listDocuments() {
  return db.prepare(`
    SELECT documents.*, COUNT(chunks.id) AS chunk_count
    FROM documents
    LEFT JOIN chunks ON chunks.document_id = documents.id
    GROUP BY documents.id
    ORDER BY documents.updated_at DESC
  `).all();
}

export function getDocument(id) {
  return db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
}

export function getDocumentWithChunks(id) {
  const document = getDocument(id);
  if (!document) return null;
  const chunks = getChunksForDocument(id);
  const sections = getSectionsForDocument(id, chunks);
  const bookmarks = db.prepare("SELECT * FROM bookmarks WHERE document_id = ? ORDER BY created_at DESC").all(id);
  return { document, chunks, sections, bookmarks };
}

export function getChunksForDocument(documentId) {
  const rows = db.prepare("SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index").all(documentId);
  return rows.map((chunk, index) => {
    const quality = scoreChunkQuality(chunk.text, { chunkIndex: index, chunkCount: rows.length });
    return { ...chunk, ...quality };
  });
}

export function getSectionsForDocument(documentId, knownChunks = null) {
  const sections = db.prepare("SELECT * FROM sections WHERE document_id = ? ORDER BY section_index").all(documentId);
  if (sections.length) return sections;
  const chunks = knownChunks || getChunksForDocument(documentId);
  if (!chunks.length) return [];
  return [{
    id: `${documentId}-section-0`,
    document_id: documentId,
    section_index: 0,
    title: "Document",
    start_chunk: 0,
    end_chunk: chunks.length - 1,
    summary: "Full document text"
  }];
}

export function replaceSectionsForDocument(documentId, sections) {
  const insertSection = db.prepare(`
    INSERT INTO sections (id, document_id, section_index, title, start_chunk, end_chunk, summary)
    VALUES (@id, @document_id, @section_index, @title, @start_chunk, @end_chunk, @summary)
  `);
  return db.transaction(() => {
    db.prepare("DELETE FROM sections WHERE document_id = ?").run(documentId);
    return sections.map((section) => {
      const row = toDbSection({ id: uuid(), documentId, ...section });
      insertSection.run(row);
      return row;
    });
  })();
}

export function updateProgress(id, currentChunk, currentOffsetSeconds) {
  db.prepare(`
    UPDATE documents
    SET current_chunk = ?, current_offset_seconds = ?, updated_at = ?
    WHERE id = ?
  `).run(currentChunk, currentOffsetSeconds, new Date().toISOString(), id);
}

export function addBookmark(documentId, chunkIndex, label, note = "") {
  const bookmark = {
    id: uuid(),
    document_id: documentId,
    chunk_index: chunkIndex,
    label,
    note,
    created_at: new Date().toISOString()
  };
  db.prepare(`
    INSERT INTO bookmarks (id, document_id, chunk_index, label, note, created_at)
    VALUES (@id, @document_id, @chunk_index, @label, @note, @created_at)
  `).run(bookmark);
  return bookmark;
}

export function findChunk(documentId, chunkIndex) {
  return db.prepare("SELECT * FROM chunks WHERE document_id = ? AND chunk_index = ?").get(documentId, chunkIndex);
}

export function findAudioCache(input) {
  return db.prepare(`
    SELECT * FROM audio_cache
    WHERE document_id = ? AND chunk_index = ? AND provider = ? AND voice = ?
      AND speed = ? AND pitch = ? AND text_hash = ?
  `).get(input.documentId, input.chunkIndex, input.provider, input.voice, input.speed, input.pitch, input.textHash);
}

export function saveAudioCache(input) {
  const row = {
    id: uuid(),
    document_id: input.documentId,
    chunk_index: input.chunkIndex,
    provider: input.provider,
    voice: input.voice,
    speed: input.speed,
    pitch: input.pitch,
    text_hash: input.textHash,
    file_path: input.filePath,
    byte_length: input.byteLength,
    duration_seconds: input.durationSeconds,
    created_at: new Date().toISOString()
  };
  db.prepare(`
    INSERT INTO audio_cache (
      id, document_id, chunk_index, provider, voice, speed, pitch, text_hash,
      file_path, byte_length, duration_seconds, created_at
    ) VALUES (
      @id, @document_id, @chunk_index, @provider, @voice, @speed, @pitch, @text_hash,
      @file_path, @byte_length, @duration_seconds, @created_at
    )
    ON CONFLICT (document_id, chunk_index, provider, voice, speed, pitch, text_hash)
    DO UPDATE SET
      file_path = excluded.file_path,
      byte_length = excluded.byte_length,
      duration_seconds = excluded.duration_seconds,
      created_at = excluded.created_at
  `).run(row);
}

export function getAudioCachesForDocument(documentId) {
  return db.prepare("SELECT * FROM audio_cache WHERE document_id = ? ORDER BY chunk_index").all(documentId);
}

export function getPodcastScript(documentId) {
  return db.prepare("SELECT * FROM podcast_scripts WHERE document_id = ?").get(documentId);
}

export function savePodcastScript(documentId, script) {
  db.prepare(`
    INSERT INTO podcast_scripts (document_id, script, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT (document_id) DO UPDATE SET script = excluded.script, created_at = excluded.created_at
  `).run(documentId, script, new Date().toISOString());
}

export function getAppSettings() {
  const stored = Object.fromEntries(db.prepare("SELECT key, value FROM app_settings").all().map((row) => [row.key, row.value]));
  return {
    openaiSummaryModel: stored.openaiSummaryModel || env.openaiSummaryModel,
    openaiApiKey: stored.openaiApiKey || env.openaiApiKey,
    kokoroVoice: stored.kokoroVoice || "af_heart"
  };
}

export function getPublicAppSettings() {
  return getPublicSettingsFromStore(getAppSettings());
}

export function updateAppSettings(nextSettings) {
  const settings = { ...pickDefined(nextSettings), updated_at: new Date().toISOString() };
  const save = db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value");
  db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) save.run(key, String(value));
  })();
  return getPublicAppSettings();
}

function getPublicSettingsFromStore(settings) {
  return {
    openaiSummaryModel: settings.openaiSummaryModel || env.openaiSummaryModel,
    kokoroVoice: settings.kokoroVoice || "af_heart",
    hasOpenaiApiKey: Boolean(settings.openaiApiKey || env.openaiApiKey),
  };
}

function pickDefined(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function toDbDocument(doc) {
  return {
    id: doc.id,
    user_id: doc.userId,
    title: doc.title,
    original_name: doc.originalName,
    mime_type: doc.mimeType,
    file_path: doc.filePath,
    text_hash: doc.textHash,
    char_count: doc.charCount,
    word_count: doc.wordCount,
    estimated_minutes: doc.estimatedMinutes,
    current_chunk: doc.currentChunk ?? 0,
    current_offset_seconds: doc.currentOffsetSeconds ?? 0,
    created_at: doc.created_at,
    updated_at: doc.updated_at
  };
}

function toDbChunk(chunk) {
  return {
    id: chunk.id,
    document_id: chunk.documentId,
    chunk_index: chunk.chunkIndex,
    text: chunk.text,
    start_char: chunk.startChar,
    end_char: chunk.endChar,
    estimated_seconds: chunk.estimatedSeconds,
    quality_score: chunk.quality_score ?? 1,
    quality_status: chunk.quality_status ?? "ok",
    quality_reasons: JSON.stringify(chunk.quality_reasons || [])
  };
}

function toDbSection(section) {
  return {
    id: section.id,
    document_id: section.documentId,
    section_index: section.sectionIndex,
    title: section.title,
    start_chunk: section.startChunk,
    end_chunk: section.endChunk,
    summary: section.summary || ""
  };
}
