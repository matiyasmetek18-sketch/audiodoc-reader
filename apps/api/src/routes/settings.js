import { Router } from "express";
import { getPublicAppSettings, updateAppSettings } from "../db/repositories.js";
import { getTtsCapabilities } from "../services/tts/index.js";

export const settingsRouter = Router();

settingsRouter.get("/", (_req, res) => {
  res.json({ settings: withCapabilities(getPublicAppSettings()) });
});

settingsRouter.patch("/", (req, res) => {
  const settings = {};
  for (const key of [
    "ttsProvider",
    "systemVoice",
    "openaiTtsModel",
    "openaiTtsVoice",
    "openaiSummaryModel",
    "elevenLabsVoiceId",
    "elevenLabsModelId"
  ]) {
    if (typeof req.body[key] === "string" && req.body[key].trim()) settings[key] = req.body[key].trim();
  }

  if (typeof req.body.openaiApiKey === "string" && req.body.openaiApiKey.trim()) {
    settings.openaiApiKey = req.body.openaiApiKey.trim();
  }
  if (typeof req.body.elevenLabsApiKey === "string" && req.body.elevenLabsApiKey.trim()) {
    settings.elevenLabsApiKey = req.body.elevenLabsApiKey.trim();
  }

  res.json({ settings: withCapabilities(updateAppSettings(settings)) });
});

function withCapabilities(settings) {
  const capabilities = getTtsCapabilities();
  return {
    ...settings,
    ttsProvider: settings.ttsProvider === "system" && !capabilities.systemVoice ? "browser" : settings.ttsProvider,
    capabilities
  };
}
