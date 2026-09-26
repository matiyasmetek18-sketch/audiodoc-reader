import fs from "node:fs";
import path from "node:path";
import { env } from "../src/config/env.js";
import { openDatabase } from "../src/db/schema.js";

const jsonPath = process.env.JSON_SOURCE_PATH || path.join(path.dirname(env.databasePath), "app.json");
if (!fs.existsSync(jsonPath)) {
  throw new Error(`JSON store not found: ${jsonPath}`);
}

const source = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const db = openDatabase(env.databasePath);

const statements = {
  user: db.prepare(`
    INSERT OR IGNORE INTO users (id, email, name, created_at)
    VALUES (@id, @email, @name, @created_at)
  `),
  document: db.prepare(`
    INSERT OR IGNORE INTO documents (
      id, user_id, title, original_name, mime_type, file_path, text_hash,
      char_count, word_count, estimated_minutes, current_chunk,
      current_offset_seconds, created_at, updated_at
    ) VALUES (
      @id, @user_id, @title, @original_name, @mime_type, @file_path,
      @text_hash, @char_count, @word_count, @estimated_minutes,
      @current_chunk, @current_offset_seconds, @created_at, @updated_at
    )
  `),
  chunk: db.prepare(`
    INSERT OR IGNORE INTO chunks (id, document_id, chunk_index, text, start_char, end_char, estimated_seconds)
    VALUES (@id, @document_id, @chunk_index, @text, @start_char, @end_char, @estimated_seconds)
  `),
  section: db.prepare(`
    INSERT OR IGNORE INTO sections (id, document_id, section_index, title, start_chunk, end_chunk, summary)
    VALUES (@id, @document_id, @section_index, @title, @start_chunk, @end_chunk, @summary)
  `),
  bookmark: db.prepare(`
    INSERT OR IGNORE INTO bookmarks (id, document_id, chunk_index, label, note, created_at)
    VALUES (@id, @document_id, @chunk_index, @label, @note, @created_at)
  `),
  audioCache: db.prepare(`
    INSERT OR IGNORE INTO audio_cache (
      id, document_id, chunk_index, provider, voice, speed, pitch, text_hash,
      file_path, byte_length, duration_seconds, created_at
    ) VALUES (
      @id, @document_id, @chunk_index, @provider, @voice, @speed, @pitch,
      @text_hash, @file_path, @byte_length, @duration_seconds, @created_at
    )
  `),
  podcast: db.prepare(`
    INSERT OR IGNORE INTO podcast_scripts (document_id, script, created_at)
    VALUES (@document_id, @script, @created_at)
  `),
  setting: db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
};

const migrate = db.transaction(() => {
  for (const row of source.users || []) statements.user.run(row);
  for (const row of source.documents || []) statements.document.run({
    ...row,
    current_chunk: row.current_chunk ?? 0,
    current_offset_seconds: row.current_offset_seconds ?? 0
  });
  for (const row of source.chunks || []) statements.chunk.run(row);
  for (const row of source.sections || []) statements.section.run(row);
  for (const row of source.bookmarks || []) statements.bookmark.run(row);
  for (const row of source.audio_cache || []) statements.audioCache.run(row);
  for (const row of source.podcast_scripts || []) statements.podcast.run(row);
  for (const [key, value] of Object.entries(source.app_settings || {})) statements.setting.run(key, String(value));
});

migrate();

const counts = Object.fromEntries(
  ["users", "documents", "chunks", "sections", "bookmarks", "audio_cache", "podcast_scripts", "app_settings"]
    .map((table) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count])
);

console.log(`Migrated ${jsonPath} to ${env.databasePath}`);
console.log(JSON.stringify(counts, null, 2));
