import fs from "node:fs";
import path from "node:path";

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
  return {
    platform: process.platform,
    sayPath,
    zipPath,
    systemVoice: Boolean(sayPath),
    systemExport: Boolean(sayPath && zipPath)
  };
}
