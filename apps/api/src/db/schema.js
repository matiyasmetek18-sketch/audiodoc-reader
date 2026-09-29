import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    word_count INTEGER NOT NULL,
    estimated_minutes INTEGER NOT NULL,
    current_chunk INTEGER NOT NULL DEFAULT 0,
    current_offset_seconds REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    start_char INTEGER NOT NULL,
    end_char INTEGER NOT NULL,
    estimated_seconds REAL NOT NULL,
    quality_score REAL NOT NULL DEFAULT 1,
    quality_status TEXT NOT NULL DEFAULT 'ok',
    quality_reasons TEXT NOT NULL DEFAULT '[]',
    UNIQUE (document_id, chunk_index),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    section_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    start_chunk INTEGER NOT NULL,
    end_chunk INTEGER NOT NULL,
    summary TEXT NOT NULL DEFAULT "",
    UNIQUE (document_id, section_index),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    label TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT "",
    created_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS audio_cache (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    provider TEXT NOT NULL,
    voice TEXT NOT NULL,
    speed REAL NOT NULL,
    pitch REAL NOT NULL,
    text_hash TEXT NOT NULL,
    file_path TEXT NOT NULL,
    byte_length INTEGER NOT NULL,
    duration_seconds REAL NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (document_id, chunk_index, provider, voice, speed, pitch, text_hash),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS podcast_scripts (
    document_id TEXT PRIMARY KEY,
    script TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id, chunk_index);
  CREATE INDEX IF NOT EXISTS idx_sections_document ON sections(document_id, section_index);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_document ON bookmarks(document_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_audio_cache_document ON audio_cache(document_id, chunk_index);
`;

export function openDatabase(databasePath = env.databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.exec(schema);
  const columns = new Set(database.prepare("PRAGMA table_info(chunks)").all().map((column) => column.name));
  if (!columns.has("quality_score")) database.exec("ALTER TABLE chunks ADD COLUMN quality_score REAL NOT NULL DEFAULT 1");
  if (!columns.has("quality_status")) database.exec("ALTER TABLE chunks ADD COLUMN quality_status TEXT NOT NULL DEFAULT 'ok'");
  if (!columns.has("quality_reasons")) database.exec("ALTER TABLE chunks ADD COLUMN quality_reasons TEXT NOT NULL DEFAULT '[]'");
  return database;
}
