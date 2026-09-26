# AudioDoc Reader

A full-stack ElevenReader-style app for uploading PDF, DOCX, and TXT files, extracting clean text, and reading documents aloud with chunked, cached text-to-speech.

## Features

- Drag-and-drop uploads for PDF, DOCX, and TXT
- Text extraction, cleanup, and AI-assisted section organization for long documents
- SQLite metadata store, local file storage, and cached audio chunks
- Modular TTS providers: no-key local macOS voices, OpenAI, ElevenLabs, or browser Web Speech fallback
- Streaming chunk playback with play/pause, skip, progress, speed, and pitch controls
- Sentence/chunk highlighting, smooth scroll, resume position, bookmarks, and estimated reading time
- Podcast mode that creates a two-voice conversational script and reads it chunk-by-chunk
- Dark, mobile-responsive React/Next.js interface
- Offline MP3 export for OpenAI or ElevenLabs voices

## Project Structure

```txt
apps/
  api/                 Express backend
    src/
      routes/          API endpoints
      services/        parsing, chunking, TTS, podcast, storage
      services/tts/    provider implementations
      db/              SQLite schema, migration, and repository layer
  web/                 Next.js frontend
    app/               App router pages/styles
    components/        Reader dashboard components
    lib/               API client and helpers
storage/
  uploads/             Original uploads
  audio/               Cached generated MP3 files
  cache/               Reserved for provider/cache artifacts
```

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

The API creates `storage/app.db` and its schema on startup. If you are upgrading an older checkout that has `storage/app.json`, run the one-time migration before starting the app:

```bash
npm run migrate --workspace apps/api
```

Frontend: http://localhost:3000
Backend: http://localhost:4000

The local system-voice provider uses macOS-only `say` and `zip` executables. AudioDoc feature-detects them at startup; on other operating systems it hides the local provider and falls back to browser speech. OpenAI, ElevenLabs, and browser Web Speech are the cross-platform options. For hosted TTS, open the app Settings panel and paste your API key, or set `TTS_PROVIDER=openai` / `TTS_PROVIDER=elevenlabs` in `.env` with the matching key. Runtime settings are stored in SQLite and do not require restarting the app. With `TTS_PROVIDER=browser`, the app uses the browser Web Speech API and does not generate downloadable audio.

OpenAI voices available in the UI: `alloy`, `ash`, `ballad`, `cedar`, `coral`, `echo`, `fable`, `marin`, `nova`, `onyx`, `sage`, `shimmer`, and `verse`. OpenAI’s current docs recommend `marin` or `cedar` for best quality.

## Screenshots

Suggested portfolio captures can live in `docs/screenshots/`:

- `library-and-reader.png`: the document library beside an active highlighted passage.
- `settings-and-providers.png`: the provider settings panel showing browser, OpenAI, and ElevenLabs options.
- `podcast-mode.png`: the conversational podcast view with playback controls.

These are intentionally placeholders rather than generated claims about the UI; capture them from a running local instance before publishing the project.

## API Routes

- `GET /health` API health check and active environment TTS provider
- `POST /api/auth/login` basic local login, returns a demo token
- `GET /api/documents` list uploaded files and reading progress
- `POST /api/documents` upload PDF/DOCX/TXT
- `GET /api/documents/:id` get metadata, chunks, bookmarks
- `PATCH /api/documents/:id/progress` save resume position
- `POST /api/documents/:id/bookmarks` add a bookmark
- `POST /api/documents/:id/organize` rebuild natural reading sections from extracted chunks
- `POST /api/documents/:id/audio-download` generate a full downloadable audio file with the selected provider
- `GET /api/settings` read local provider/model/voice settings without returning secrets
- `PATCH /api/settings` save local provider/model/voice settings and API keys
- `POST /api/tts/chunk` create or reuse cached audio for a chunk
- `GET /api/audio/:file` stream or download a generated/cached audio file with range support
- `POST /api/documents/:id/podcast` generate a conversational podcast script

## Notes

The backend chunks text into manageable segments and caches audio by provider, voice, speed, pitch, and source hash. This keeps repeated playback fast and reduces API cost.
