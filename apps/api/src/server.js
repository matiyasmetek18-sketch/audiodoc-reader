import fs from "node:fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { attachUser } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { documentsRouter } from "./routes/documents.js";
import { settingsRouter } from "./routes/settings.js";
import { audioRouter, ttsRouter } from "./routes/tts.js";

fs.mkdirSync(env.uploadDir, { recursive: true });
fs.mkdirSync(env.audioDir, { recursive: true });
fs.mkdirSync(env.cacheDir, { recursive: true });

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: env.webOrigin, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));
app.use(attachUser);

app.get("/health", (_req, res) => {
  res.json({ ok: true, ttsProvider: env.ttsProvider });
});

app.use("/api/auth", authRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/tts", ttsRouter);
app.use("/api/audio", audioRouter);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const message = status === 500 && env.nodeEnv === "production" ? "Internal server error" : err.message;
  res.status(status).json({ error: message, code: err.code });
});

app.listen(env.port, () => {
  console.log(`AudioDoc API listening on http://localhost:${env.port}`);
});
