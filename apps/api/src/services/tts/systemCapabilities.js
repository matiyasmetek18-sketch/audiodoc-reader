import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function findExecutable(command) {
  const candidates = [];
  if (path.isAbsolute(command)) candidates.push(command);
  else {
    const pathEntries = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
    const extensions = process.platform === "win32"
      ? ["", ...(process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";")]
      : [""];
    for (const entry of pathEntries) {
      for (const extension of extensions) candidates.push(path.join(entry, `${command}${extension}`));
    }
  }

  return candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }) || null;
}

export function detectSystemCapabilities() {
  const sayPath = findExecutable("say");
  const zipPath = findExecutable("/usr/bin/zip") || findExecutable("zip");
  const systemVoices = sayPath ? listSystemVoices(sayPath) : [];
  return {
    platform: process.platform,
    sayPath,
    zipPath,
    systemVoice: Boolean(sayPath && systemVoices.length),
    systemExport: Boolean(sayPath && systemVoices.length && zipPath),
    systemVoices
  };
}

function listSystemVoices(sayPath) {
  try {
    const output = execFileSync(sayPath, ["-v", "?"], { encoding: "utf8", maxBuffer: 1024 * 1024 });
    return output
      .split("\n")
      .map((line) => line.split("#")[0].trim())
      .map((line) => line.match(/^(.*?)\s{2,}[a-z]{2}(?:[_-][A-Z0-9]+)?\s*$/i)?.[1]?.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
