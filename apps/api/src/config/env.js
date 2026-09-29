import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

dotenv.config({ path: path.join(projectRoot, ".env") });
dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  databasePath: path.resolve(projectRoot, process.env.DATABASE_PATH ?? "./storage/app.db"),
  uploadDir: path.resolve(projectRoot, process.env.UPLOAD_DIR ?? "./storage/uploads"),
  audioDir: path.resolve(projectRoot, process.env.AUDIO_DIR ?? "./storage/audio"),
  cacheDir: path.resolve(projectRoot, process.env.CACHE_DIR ?? "./storage/cache"),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 100),
  ttsProvider: process.env.TTS_PROVIDER ?? "browser",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiTtsModel: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
  openaiTtsVoice: process.env.OPENAI_TTS_VOICE ?? "onyx",
  openaiSummaryModel: process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4.1-mini",
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? "",
  elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? "",
  elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2"
};
