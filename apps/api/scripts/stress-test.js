import fs from "node:fs/promises";

const baseUrl = process.env.AUDIODOC_URL || "http://localhost:4000";
const fixturePath = process.env.STRESS_FILE;
const provider = process.env.STRESS_PROVIDER || "test";
const voice = process.env.STRESS_VOICE || "af_heart";

if (!fixturePath) {
  throw new Error("Set STRESS_FILE to a small TXT fixture before running this script.");
}

const content = await fs.readFile(fixturePath);
const form = new FormData();
form.append("file", new Blob([content], { type: "text/plain" }), "stress-fixture.txt");
const upload = await fetch(`${baseUrl}/api/documents`, { method: "POST", body: form });
if (!upload.ok) throw new Error(`Upload failed: ${upload.status} ${await upload.text()}`);
const uploaded = await upload.json();
if (uploaded.chunks) throw new Error("Upload response still contains inline chunks.");
const chunkResponse = await fetch(`${baseUrl}/api/documents/${uploaded.document.id}/chunks`);
if (!chunkResponse.ok || !(await chunkResponse.json()).chunks?.length) throw new Error("Separate chunk endpoint failed.");

const requests = await Promise.all(
  Array.from({ length: 8 }, () => fetch(`${baseUrl}/api/tts/chunk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ documentId: uploaded.document.id, chunkIndex: 0, provider, voice, speed: 1, pitch: 0 })
  }))
);
if (requests.some((response) => !response.ok)) throw new Error(`Concurrent TTS failed: ${requests.map((response) => response.status).join(", ")}`);
const results = await Promise.all(requests.map((response) => response.json()));
const shared = results.filter((result) => result.shared).length;
if (shared < results.length - 1) throw new Error(`Single-flight failed: only ${shared} requests shared the in-flight synthesis.`);
const followUp = await fetch(`${baseUrl}/api/tts/chunk`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ documentId: uploaded.document.id, chunkIndex: 0, provider, voice, speed: 1, pitch: 0 })
});
const followUpResult = await followUp.json();
if (!followUpResult.cached) throw new Error("Follow-up TTS request did not use the populated cache.");

console.log(JSON.stringify({ uploadStatus: upload.status, summary: uploaded.summary, ttsRequests: results.length, shared, followUpCached: followUpResult.cached }));
