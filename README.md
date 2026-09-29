# AudioDoc Reader

[![CI](https://github.com/matiyasmetek18-sketch/audiodoc-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/matiyasmetek18-sketch/audiodoc-reader/actions/workflows/ci.yml)

A full-stack ElevenReader-style app for uploading PDF, DOCX, and TXT files, extracting clean text, and reading documents aloud with chunked, cached text-to-speech.

## Why I Built This

I built AudioDoc Reader to make long documents easier to consume while learning how to turn a real document-processing workflow into a resilient full-stack product. The project focuses on the details that make a reader trustworthy: preserving text, keeping playback responsive, handling imperfect files, and making local-first features useful without requiring a paid API.

## Engineering Highlights

- **Zero-loss persistence migration:** moved the existing 3-document, 2,630-chunk dataset from JSON into SQLite and verified the migrated database with `PRAGMA integrity_check: ok`.
- **Race-free TTS caching:** concurrent requests for one chunk now use a per-cache-key single-flight lock. In the stress run, 8 identical requests produced 1 synthesis, 7 shared results, and a follow-up request hit the populated cache.
- **Local OCR quality filter:** a bundled English word list and local character, structure, ISBN, and fragment heuristics scored a 20-sample labeled smoke set at 100% precision and 100% recall. This is an intentionally small benchmark, not a claim of production-perfect classification; flagged text remains visible by default.
- **Measured failure handling:** malformed extraction inputs return controlled 422 responses, 8 concurrent uploads completed 8/8, traversal attempts stayed inside UUID-based storage paths, and an interrupted 52 MB upload left SQLite integrity intact after restart. Upload responses now return a lightweight summary rather than inlining every chunk.
- **Playback measurements:** after punctuation-preserving chunking, average measured chunk-boundary delay fell from 0.118s to 0.111s in the local five-chunk comparison. End-to-end first audio was about 2.31s for a small document and 21.52s for the 52 MB stress document, including upload.

The stress figures above come from local runs on this checkout and use a small hand-labeled quality set. They are useful regression baselines, not cross-machine performance guarantees.

## Features

- Drag-and-drop uploads for PDF, DOCX, and TXT
- Text extraction, cleanup, and AI-assisted section organization for long documents
- Local text-quality heuristics flag likely OCR garbage and non-narrative front/back matter without silently deleting content
- SQLite metadata store, local file storage, and cached audio chunks
- Modular TTS providers: browser Web Speech (suggested free default), no-key local macOS voices, OpenAI, or ElevenLabs
- Full installed voice selection for macOS `say` and browser Web Speech, with natural punctuation-preserving chunking
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

The CI workflow runs `npm run lint`, `npm run build`, and the deterministic API stress checks on every push and pull request. The badge above uses a placeholder GitHub owner because this checkout does not currently have a Git remote configured; replace `YOUR_GITHUB_USERNAME/audiodoc-reader` with the published repository path when you push it.

The local system-voice provider uses macOS-only `say` and `zip` executables. AudioDoc feature-detects them at startup; on other operating systems it hides the local provider and falls back to browser speech. OpenAI, ElevenLabs, and browser Web Speech are the cross-platform options. Browser Web Speech is the suggested free default because Chrome and Edge often provide more natural voices than the basic macOS `say` voice. On macOS, `say -v ?` supplies the installed voice list; for better free local quality, download an Enhanced or Premium voice from System Settings → Accessibility → Spoken Content → System Voice → Manage Voices. For hosted TTS, open the app Settings panel and paste your API key, or set `TTS_PROVIDER=openai` / `TTS_PROVIDER=elevenlabs` in `.env` with the matching key. Runtime settings are stored in SQLite and do not require restarting the app. With `TTS_PROVIDER=browser`, the app uses the browser Web Speech API and does not generate downloadable audio.

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
- `GET /api/documents/:id/chunks` fetch chunk text separately from document metadata
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

The backend chunks text into manageable segments and caches audio by provider, voice, speed, pitch, and source hash. Each chunk also receives a local quality score based on a bundled English word list, character signals, OCR fragment patterns, ISBN/catalog markers, and edge-of-document matter. Low-confidence chunks remain visible and playable by default; use Reading → Skip flagged chunks during playback to opt into skipping them. This keeps repeated playback fast and reduces API cost without risking accidental content loss.
