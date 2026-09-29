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
  kokoroModelDir: path.resolve(projectRoot, process.env.KOKORO_MODEL_DIR ?? "./storage/models/kokoro"),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 100),
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiSummaryModel: process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4.1-mini"
};
