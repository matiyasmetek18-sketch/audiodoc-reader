"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  CheckCircle,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  Sparkles,
  X,
  Volume2
} from "lucide-react";
import { api, audioUrl } from "../lib/api";
import { formatTime } from "../lib/format";

const openAiVoices = ["alloy", "ash", "ballad", "cedar", "coral", "echo", "fable", "marin", "nova", "onyx", "sage", "shimmer", "verse"];
const systemVoices = [
  "Reed (English (US))",
  "Rocko (English (US))",
  "Eddy (English (US))",
  "Grandpa (English (US))",
  "Daniel"
];

const deepVoices = [
  { label: "Local Mac Reed", value: "Reed (English (US))", provider: "system" },
  { label: "Local Mac Rocko", value: "Rocko (English (US))", provider: "system" },
  { label: "Local Mac Eddy", value: "Eddy (English (US))", provider: "system" },
  { label: "Local Mac Daniel", value: "Daniel", provider: "system" },
  { label: "Browser deep", value: "browser-deep", provider: "browser" },
  ...openAiVoices.map((voice) => ({ label: `OpenAI ${voice}`, value: voice, provider: "openai" })),
  { label: "ElevenLabs deep", value: "", provider: "elevenlabs" }
];

const browserVoice = deepVoices.find((item) => item.provider === "browser");

function voiceForProvider(provider, value, capabilities) {
  const available = deepVoices.filter((item) => item.provider !== "system" || capabilities?.systemVoice);
  return available.find((item) => item.provider === provider && item.value === value)
    || available.find((item) => item.provider === provider)
    || available.find((item) => item.provider === "browser")
    || browserVoice;
}

export function Reader({ documentBundle, onProgressSaved, onRefresh }) {
  const { document, chunks, sections = [], bookmarks } = documentBundle;
  const [chunkIndex, setChunkIndex] = useState(document.current_chunk || 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [voice, setVoice] = useState(browserVoice);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [elapsed, setElapsed] = useState(document.current_offset_seconds || 0);
  const [podcast, setPodcast] = useState(null);
  const [settings, setSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [localSections, setLocalSections] = useState(sections);
  const [organizing, setOrganizing] = useState(false);
  const [downloadState, setDownloadState] = useState({ status: "idle", message: "", url: "" });
  const availableVoices = useMemo(
    () => deepVoices.filter((item) => item.provider !== "system" || settings?.capabilities?.systemVoice),
    [settings?.capabilities?.systemVoice]
  );
  const audioRef = useRef(null);
  const utteranceRef = useRef(null);
  const activeRef = useRef(null);
  const isPlayingRef = useRef(false);
  const chunkIndexRef = useRef(document.current_chunk || 0);
  const activeChunksRef = useRef(chunks);
  const podcastRef = useRef(null);
  const documentChunkRef = useRef(document.current_chunk || 0);

  const activeChunks = podcast?.chunks || chunks;
  const activeSections = podcast ? [] : localSections;
  const activeChunk = activeChunks[chunkIndex] || activeChunks[0];
  const totalSeconds = useMemo(
    () => activeChunks.reduce((sum, chunk) => sum + Number(chunk.estimated_seconds || chunk.estimatedSeconds || 0), 0),
    [activeChunks]
  );
  const completedSeconds = useMemo(
    () => activeChunks.slice(0, chunkIndex).reduce((sum, chunk) => sum + Number(chunk.estimated_seconds || chunk.estimatedSeconds || 0), 0),
    [activeChunks, chunkIndex]
  );
  const progress = totalSeconds ? Math.min(100, ((completedSeconds + elapsed) / totalSeconds) * 100) : 0;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [chunkIndex, podcast]);

  useEffect(() => {
    chunkIndexRef.current = chunkIndex;
    activeChunksRef.current = activeChunks;
    podcastRef.current = podcast;
    if (!podcast) documentChunkRef.current = chunkIndex;
  }, [activeChunks, chunkIndex, podcast]);

  useEffect(() => {
    api("/api/settings")
      .then((data) => {
        setSettings(data.settings);
        const configured = data.settings.ttsProvider;
        const capabilities = data.settings.capabilities;
        if (configured === "openai" && data.settings.hasOpenaiApiKey) {
          setVoice(voiceForProvider("openai", data.settings.openaiTtsVoice, capabilities));
        } else if (configured === "elevenlabs" && data.settings.hasElevenLabsApiKey) {
          setVoice(voiceForProvider("elevenlabs", data.settings.elevenLabsVoiceId, capabilities));
        } else if (configured === "system" && capabilities?.systemVoice) {
          setVoice(voiceForProvider("system", data.settings.systemVoice, capabilities));
        } else {
          setVoice(voiceForProvider("browser", "browser-deep", capabilities));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Reset reader-local state when switching to a different document.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChunkIndex(document.current_chunk || 0);
    setElapsed(document.current_offset_seconds || 0);
    setPodcast(null);
    setLocalSections(sections);
    documentChunkRef.current = document.current_chunk || 0;
    stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.id]);

  async function play() {
    if (!activeChunk) return;
    setIsPlaying(true);
    isPlayingRef.current = true;
    if (voice.provider === "browser" || podcast) {
      speakInBrowser(activeChunk.text);
      return;
    }

    setLoadingAudio(true);
    try {
      const data = await api("/api/tts/chunk", {
        method: "POST",
        body: JSON.stringify({
          documentId: document.id,
          chunkIndex,
          provider: voice.provider,
          voice: voice.value,
          speed,
          pitch
        })
      });
      const audio = audioRef.current;
      audio.src = audioUrl(data.audioUrl);
      audio.playbackRate = speed;
      audio.currentTime = Math.min(elapsed, Number(data.durationSeconds || 0));
      await audio.play();
    } catch (error) {
      window.alert(`${error.message}. Falling back to browser speech.`);
      speakInBrowser(activeChunk.text);
    } finally {
      setLoadingAudio(false);
    }
  }

  function speakInBrowser(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((candidate) => /male|daniel|david|google uk english male/i.test(candidate.name)) || voices[0] || null;
    utterance.rate = speed;
    utterance.pitch = 1 + pitch;
    utterance.onend = nextChunk;
    utterance.onboundary = (event) => {
      if (event.name === "word") setElapsed((event.elapsedTime || 0) / 1000);
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function pause() {
    setIsPlaying(false);
    isPlayingRef.current = false;
    audioRef.current?.pause();
    window.speechSynthesis.pause();
    saveProgress(chunkIndex, elapsed);
  }

  function stopPlayback() {
    setIsPlaying(false);
    isPlayingRef.current = false;
    audioRef.current?.pause();
    window.speechSynthesis.cancel();
  }

  function nextChunk() {
    const currentIndex = chunkIndexRef.current;
    const currentChunks = activeChunksRef.current;
    const next = Math.min(currentChunks.length - 1, currentIndex + 1);
    setElapsed(0);
    setChunkIndex(next);
    saveProgress(next, 0);
    if (isPlayingRef.current && next !== currentIndex) {
      setTimeout(() => playChunk(next), 80);
    } else {
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  }

  async function playChunk(index) {
    setChunkIndex(index);
    setElapsed(0);
    isPlayingRef.current = true;
    setIsPlaying(true);
    const currentChunks = activeChunksRef.current;
    if (voice.provider === "browser" || podcastRef.current) {
      speakInBrowser(currentChunks[index].text);
      return;
    }
    const data = await api("/api/tts/chunk", {
      method: "POST",
      body: JSON.stringify({ documentId: document.id, chunkIndex: index, provider: voice.provider, voice: voice.value, speed, pitch })
    });
    audioRef.current.src = audioUrl(data.audioUrl);
    audioRef.current.playbackRate = speed;
    await audioRef.current.play();
  }

  function skip(direction) {
    const audio = audioRef.current;
    if (voice.provider !== "browser" && audio?.src) {
      audio.currentTime = Math.max(0, audio.currentTime + direction * 20);
      setElapsed(audio.currentTime);
      return;
    }
    const currentChunks = activeChunksRef.current;
    const next = Math.min(currentChunks.length - 1, Math.max(0, chunkIndex + direction));
    setChunkIndex(next);
    setElapsed(0);
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setTimeout(() => speakInBrowser(currentChunks[next].text), 50);
    }
  }

  async function saveProgress(nextChunk = chunkIndex, offset = elapsed) {
    if (podcast) return;
    await api(`/api/documents/${document.id}/progress`, {
      method: "PATCH",
      body: JSON.stringify({ currentChunk: nextChunk, currentOffsetSeconds: offset })
    }).catch(() => {});
    onProgressSaved?.();
  }

  async function addBookmark() {
    await api(`/api/documents/${document.id}/bookmarks`, {
      method: "POST",
      body: JSON.stringify({ chunkIndex, label: `Saved at ${formatTime(completedSeconds + elapsed)}` })
    });
    onRefresh?.();
  }

  async function startPodcastMode() {
    setLoadingAudio(true);
    try {
      documentChunkRef.current = chunkIndex;
      const data = await api(`/api/documents/${document.id}/podcast`, { method: "POST", body: JSON.stringify({}) });
      setPodcast(data);
      setChunkIndex(0);
      setElapsed(0);
      stopPlayback();
    } finally {
      setLoadingAudio(false);
    }
  }

  function exitPodcastMode() {
    stopPlayback();
    setPodcast(null);
    setChunkIndex(documentChunkRef.current);
    setElapsed(0);
  }

  async function saveSettings(formData) {
    setSettingsSaved(false);
    const payload = Object.fromEntries(formData.entries());
    const data = await api("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    setSettings(data.settings);
    setSettingsSaved(true);
    const nextProvider = data.settings.ttsProvider;
    if (nextProvider === "openai") {
      setVoice(voiceForProvider("openai", data.settings.openaiTtsVoice, data.settings.capabilities));
    } else if (nextProvider === "elevenlabs") {
      setVoice(voiceForProvider("elevenlabs", data.settings.elevenLabsVoiceId, data.settings.capabilities));
    } else if (nextProvider === "system") {
      setVoice(voiceForProvider("system", data.settings.systemVoice, data.settings.capabilities));
    } else {
      setVoice(voiceForProvider("browser", "browser-deep", data.settings.capabilities));
    }
  }

  async function generateDownload() {
    if (voice.provider === "browser") {
      setDownloadState({
        status: "error",
        message: "Choose Local Mac, OpenAI, or ElevenLabs first. Browser speech cannot be exported.",
        url: ""
      });
      return;
    }

    setDownloadState({ status: "working", message: "Generating offline audio. Large PDFs can take a while.", url: "" });
    try {
      const result = await api(`/api/documents/${document.id}/audio-download`, {
        method: "POST",
        body: JSON.stringify({
          provider: voice.provider,
          voice: voice.value,
          speed,
          pitch
        })
      });
      const readyUrl = audioUrl(result.downloadUrl);
      setDownloadState({
        status: "ready",
        message: `Ready: ${result.chunkCount} audio chunks merged.`,
        url: readyUrl
      });
      triggerBrowserDownload(readyUrl, result.fileName || "audiodoc-audio");
    } catch (error) {
      setDownloadState({ status: "error", message: error.message, url: "" });
    }
  }

  async function organizeCurrentDocument() {
    setOrganizing(true);
    try {
      const data = await api(`/api/documents/${document.id}/organize`, { method: "POST", body: JSON.stringify({}) });
      setLocalSections(data.sections || []);
    } finally {
      setOrganizing(false);
    }
  }

  function sectionForChunk(index) {
    return activeSections.find((section) => index >= sectionStart(section) && index <= sectionEnd(section));
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[#2a3340] bg-[#111720] px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-white">{podcast ? `Podcast: ${document.title}` : document.title}</p>
            <p className="text-xs text-[#9aa8b7]">{document.word_count} words · {activeChunks.length} chunks · {formatTime(completedSeconds + elapsed)} elapsed</p>
          </div>
          <div className="flex items-center gap-2">
            {podcast && (
              <button title="Back to document" onClick={exitPodcastMode} className="inline-flex items-center gap-2 rounded-md border border-[#2a3340] px-3 py-2 text-sm text-[#cbd5df] hover:bg-[#1b222c]">
                <FileText className="h-4 w-4" />
                Document
              </button>
            )}
            <button title="Podcast mode" onClick={startPodcastMode} className="rounded-md border border-[#2a3340] p-2 text-[#f0b35b] hover:bg-[#1b222c]">
              {loadingAudio ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            </button>
            <button title="Settings" onClick={() => setShowSettings(true)} className="rounded-md border border-[#2a3340] p-2 text-[#9aa8b7] hover:bg-[#1b222c]">
              <Settings className="h-4 w-4" />
            </button>
            <button title="Generate offline audio" onClick={generateDownload} className="rounded-md border border-[#2a3340] p-2 text-[#9aa8b7] hover:bg-[#1b222c]">
              {downloadState.status === "working" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </button>
            <button title="Organize document" onClick={organizeCurrentDocument} className="rounded-md border border-[#2a3340] p-2 text-[#9aa8b7] hover:bg-[#1b222c]">
              {organizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            </button>
            <button title="Bookmark" onClick={addBookmark} className="rounded-md border border-[#2a3340] p-2 text-[#9aa8b7] hover:bg-[#1b222c]">
              <Bookmark className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#26313f]">
          <div className="h-full rounded-full bg-[#61d6bd]" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_280px]">
        <div className="scrollbar-thin overflow-y-auto p-4 pb-80 md:p-6">
          <div className="mx-auto max-w-3xl space-y-3">
            {activeChunks.map((chunk, index) => (
              <div key={`${podcast ? "podcast" : document.id}-${index}`}>
                {activeSections.some((section) => sectionStart(section) === index) && (
                  <div className="mb-3 mt-6 border-b border-[#2a3340] pb-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#61d6bd]">Section</p>
                    <h2 className="mt-1 text-xl font-semibold text-white">{sectionForChunk(index)?.title}</h2>
                    {sectionForChunk(index)?.summary && <p className="mt-2 text-sm leading-6 text-[#9aa8b7]">{sectionForChunk(index).summary}</p>}
                  </div>
                )}
                <button
                  ref={index === chunkIndex ? activeRef : null}
                  onClick={() => {
                    setChunkIndex(index);
                    setElapsed(0);
                    stopPlayback();
                  }}
                  className={`w-full rounded-lg border p-4 text-left leading-7 transition ${
                    index === chunkIndex ? "reader-highlight text-white" : "border-transparent bg-transparent text-[#cbd5df] hover:bg-[#151a21]"
                  }`}
                >
                  {chunk.text}
                </button>
              </div>
            ))}
          </div>
        </div>

        <aside className="fixed inset-x-0 bottom-0 z-30 max-h-[45dvh] overflow-y-auto border-t border-[#2a3340] bg-[#10161e] p-4 shadow-2xl md:static md:max-h-none md:border-l md:border-t-0 md:shadow-none">
          <div className="space-y-5">
            <div className="flex items-center justify-center gap-3">
              <button title="Back" onClick={() => skip(-1)} className="rounded-md border border-[#2a3340] p-3 hover:bg-[#1b222c]">
                <RotateCcw className="h-5 w-5" />
              </button>
              <button
                title={isPlaying ? "Pause" : "Play"}
                onClick={isPlaying ? pause : play}
                className="rounded-md bg-[#61d6bd] p-4 text-[#07100d] hover:bg-[#73e4cd]"
              >
                {loadingAudio ? <Loader2 className="h-6 w-6 animate-spin" /> : isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
              </button>
              <button title="Forward" onClick={() => skip(1)} className="rounded-md border border-[#2a3340] p-3 hover:bg-[#1b222c]">
                <RotateCw className="h-5 w-5" />
              </button>
            </div>

            <label className="block text-sm text-[#cbd5df]">
              <span className="mb-2 flex items-center gap-2"><Volume2 className="h-4 w-4" />Voice</span>
              <select
                value={`${voice.provider}:${voice.value}`}
                onChange={(event) => {
                  const [provider, value] = event.target.value.split(":");
                  setVoice(deepVoices.find((item) => item.provider === provider && item.value === value) || deepVoices[0]);
                }}
                className="w-full rounded-md border border-[#2a3340] bg-[#151a21] px-3 py-2 text-white"
              >
                {availableVoices.map((item) => (
                  <option key={`${item.provider}:${item.value}`} value={`${item.provider}:${item.value}`}>{item.label}</option>
                ))}
              </select>
            </label>

            <Range label={`Speed ${speed.toFixed(2)}x`} min="0.75" max="2" step="0.05" value={speed} onChange={setSpeed} />
            <Range label={`Pitch ${pitch.toFixed(2)}`} min="-0.2" max="0.2" step="0.01" value={pitch} onChange={setPitch} />
            {voice.provider !== "browser" && !settings?.hasOpenaiApiKey && voice.provider === "openai" && (
              <button onClick={() => setShowSettings(true)} className="w-full rounded-md border border-[#614426] bg-[#22170b] p-3 text-left text-xs text-[#f0d7ad]">
                Add your OpenAI API key in Settings to use hosted voices.
              </button>
            )}
            <div className="rounded-lg border border-[#2a3340] p-3">
              <button
                onClick={generateDownload}
                disabled={downloadState.status === "working"}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#61d6bd] px-3 py-2 text-sm font-semibold text-[#07100d] disabled:opacity-60"
              >
                {downloadState.status === "working" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Offline audio
              </button>
              {downloadState.message && (
                <p className={`mt-2 text-xs leading-5 ${downloadState.status === "error" ? "text-red-200" : "text-[#9aa8b7]"}`}>{downloadState.message}</p>
              )}
              {downloadState.url && (
                <a href={downloadState.url} download className="mt-2 block rounded-md border border-[#2a3340] px-3 py-2 text-center text-sm text-white hover:bg-[#1b222c]">
                  Download file
                </a>
              )}
            </div>

            {!!activeSections.length && (
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">Sections</p>
                  <button onClick={organizeCurrentDocument} className="rounded-md border border-[#2a3340] p-1.5 text-[#9aa8b7] hover:bg-[#1b222c]">
                    {organizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                  {activeSections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => {
                        setChunkIndex(sectionStart(section));
                        setElapsed(0);
                        stopPlayback();
                      }}
                      className={`w-full rounded-md border p-2 text-left text-xs hover:bg-[#1b222c] ${
                        chunkIndex >= sectionStart(section) && chunkIndex <= sectionEnd(section)
                          ? "border-[#61d6bd] text-white"
                          : "border-[#2a3340] text-[#cbd5df]"
                      }`}
                    >
                      {section.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold text-white">Bookmarks</p>
              <div className="space-y-2">
                {bookmarks?.slice(0, 5).map((bookmark) => (
                  <button key={bookmark.id} onClick={() => setChunkIndex(bookmark.chunk_index)} className="w-full rounded-md border border-[#2a3340] p-2 text-left text-xs text-[#cbd5df] hover:bg-[#1b222c]">
                    {bookmark.label}
                  </button>
                ))}
                {!bookmarks?.length && <p className="text-xs text-[#9aa8b7]">No bookmarks saved.</p>}
              </div>
            </div>
          </div>
          <audio
            ref={audioRef}
            onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
            onEnded={nextChunk}
            onPause={() => saveProgress(chunkIndex, audioRef.current?.currentTime || elapsed)}
          />
        </aside>
      </div>
      {showSettings && (
        <SettingsPanel
          settings={settings}
          saved={settingsSaved}
          onClose={() => setShowSettings(false)}
          onSave={saveSettings}
        />
      )}
    </section>
  );
}

function SettingsPanel({ settings, saved, onClose, onSave }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/55">
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-[#2a3340] bg-[#10161e] p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold text-white">Settings</p>
            <p className="text-xs text-[#9aa8b7]">Keys are stored locally for this app.</p>
          </div>
          <button title="Close settings" onClick={onClose} className="rounded-md border border-[#2a3340] p-2 text-[#9aa8b7] hover:bg-[#1b222c]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            await onSave(new FormData(form));
            event.currentTarget.openaiApiKey.value = "";
            event.currentTarget.elevenLabsApiKey.value = "";
          }}
        >
          <label className="block text-sm text-[#cbd5df]">
            <span className="mb-2 block">Default TTS provider</span>
            <select name="ttsProvider" defaultValue={settings?.ttsProvider || "browser"} className="w-full rounded-md border border-[#2a3340] bg-[#151a21] px-3 py-2 text-white">
              {settings?.capabilities?.systemVoice && <option value="system">Local Mac voice</option>}
              <option value="browser">Browser Web Speech</option>
              <option value="openai">OpenAI</option>
              <option value="elevenlabs">ElevenLabs</option>
            </select>
          </label>

          {settings?.capabilities?.systemVoice && (
            <div className="rounded-lg border border-[#2a3340] p-4">
              <p className="mb-3 text-sm font-semibold text-white">No-key local voice</p>
              <label className="block text-sm text-[#cbd5df]">
                <span className="mb-2 block">Masculine voice</span>
                <select name="systemVoice" defaultValue={settings?.systemVoice || "Reed (English (US))"} className="w-full rounded-md border border-[#2a3340] bg-[#151a21] px-3 py-2 text-white">
                  {systemVoices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
                </select>
                <span className="mt-2 block text-xs text-[#9aa8b7]">Works without an API key and can export offline audio on macOS.</span>
              </label>
            </div>
          )}

          <div className="rounded-lg border border-[#2a3340] p-4">
            <p className="mb-3 text-sm font-semibold text-white">OpenAI</p>
            <label className="mb-3 block text-sm text-[#cbd5df]">
              <span className="mb-2 block">API key {settings?.hasOpenaiApiKey ? "(saved)" : ""}</span>
              <input name="openaiApiKey" type="password" placeholder="sk-..." className="w-full rounded-md border border-[#2a3340] bg-[#151a21] px-3 py-2 text-white" />
            </label>
            <label className="mb-3 block text-sm text-[#cbd5df]">
              <span className="mb-2 block">Model</span>
              <input name="openaiTtsModel" defaultValue={settings?.openaiTtsModel || "gpt-4o-mini-tts"} className="w-full rounded-md border border-[#2a3340] bg-[#151a21] px-3 py-2 text-white" />
            </label>
            <label className="block text-sm text-[#cbd5df]">
              <span className="mb-2 block">Default voice</span>
              <select name="openaiTtsVoice" defaultValue={settings?.openaiTtsVoice || "onyx"} className="w-full rounded-md border border-[#2a3340] bg-[#151a21] px-3 py-2 text-white">
                {openAiVoices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
              </select>
              <span className="mt-2 block text-xs text-[#9aa8b7]">OpenAI currently recommends `marin` or `cedar` for best quality.</span>
            </label>
          </div>

          <div className="rounded-lg border border-[#2a3340] p-4">
            <p className="mb-3 text-sm font-semibold text-white">ElevenLabs</p>
            <label className="mb-3 block text-sm text-[#cbd5df]">
              <span className="mb-2 block">API key {settings?.hasElevenLabsApiKey ? "(saved)" : ""}</span>
              <input name="elevenLabsApiKey" type="password" placeholder="ElevenLabs API key" className="w-full rounded-md border border-[#2a3340] bg-[#151a21] px-3 py-2 text-white" />
            </label>
            <label className="mb-3 block text-sm text-[#cbd5df]">
              <span className="mb-2 block">Voice ID</span>
              <input name="elevenLabsVoiceId" defaultValue={settings?.elevenLabsVoiceId || ""} className="w-full rounded-md border border-[#2a3340] bg-[#151a21] px-3 py-2 text-white" />
            </label>
            <label className="block text-sm text-[#cbd5df]">
              <span className="mb-2 block">Model</span>
              <input name="elevenLabsModelId" defaultValue={settings?.elevenLabsModelId || "eleven_multilingual_v2"} className="w-full rounded-md border border-[#2a3340] bg-[#151a21] px-3 py-2 text-white" />
            </label>
          </div>

          <button className="flex w-full items-center justify-center gap-2 rounded-md bg-[#61d6bd] px-4 py-3 font-semibold text-[#07100d] hover:bg-[#73e4cd]">
            {saved && <CheckCircle className="h-4 w-4" />}
            Save settings
          </button>
        </form>
      </div>
    </div>
  );
}

function Range({ label, value, onChange, ...props }) {
  return (
    <label className="block text-sm text-[#cbd5df]">
      <span className="mb-2 block">{label}</span>
      <input
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[#61d6bd]"
        {...props}
      />
    </label>
  );
}

function sectionStart(section) {
  return section.start_chunk ?? section.startChunk ?? 0;
}

function sectionEnd(section) {
  return section.end_chunk ?? section.endChunk ?? sectionStart(section);
}

function triggerBrowserDownload(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
