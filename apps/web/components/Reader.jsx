"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  AlignJustify,
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
  Type,
  X,
  Volume2
} from "lucide-react";
import { api, audioUrl } from "../lib/api";
import { formatTime } from "../lib/format";

const openAiVoices = ["alloy", "ash", "ballad", "cedar", "coral", "echo", "fable", "marin", "nova", "onyx", "sage", "shimmer", "verse"];
const recommendedOpenAiVoices = new Set(["marin", "cedar", "shimmer"]);
const recommendedSystemVoicePatterns = [/^Ava\b/i, /^Samantha\b/i, /^Alex\b/i, /^Daniel\b/i];
const recommendedBrowserVoicePatterns = [
  /Microsoft Aria.*Natural/i,
  /Microsoft Jenny.*Natural/i,
  /Google US English/i,
  /^Samantha\b/i,
  /^Alex\b/i
];
const fallbackBrowserVoice = { label: "Browser default", value: "", provider: "browser" };
const kokoroVoices = ["af_heart", "af_bella", "am_michael"];
const providerVoices = [
  ...openAiVoices.map((voice) => ({ label: `OpenAI ${voice}`, value: voice, provider: "openai" })),
  { label: "ElevenLabs deep", value: "", provider: "elevenlabs" }
];

function voiceForProvider(provider, value, available) {
  return available.find((item) => item.provider === provider && (item.value === value || item.voiceName === value))
    || available.find((item) => item.provider === provider)
    || available.find((item) => item.provider === "browser")
    || fallbackBrowserVoice;
}

function preferredBrowserVoice(voices) {
  return voices.find((voice) => recommendedBrowserVoicePatterns.some((pattern) => pattern.test(voice.name)) && /^en(-|_)(US|GB)/i.test(voice.lang))
    || voices.find((voice) => /^en(-|_)US/i.test(voice.lang))
    || voices[0];
}

function isRecommendedVoice(item) {
  if (item.provider === "system") return recommendedSystemVoicePatterns.some((pattern) => pattern.test(item.voiceName || item.value));
  if (item.provider === "browser") return recommendedBrowserVoicePatterns.some((pattern) => pattern.test(item.voiceName || item.value));
  if (item.provider === "openai") return recommendedOpenAiVoices.has(item.value);
  if (item.provider === "kokoro") return kokoroVoices.includes(item.value);
  return false;
}

function visibleVoiceOptions(options, showAll, selectedValue) {
  if (showAll) return options;
  const providers = [...new Set(options.map((item) => item.provider))];
  const visible = providers.flatMap((provider) => {
    const providerOptions = options.filter((item) => item.provider === provider);
    const recommended = providerOptions.filter(isRecommendedVoice);
    return recommended.length ? recommended : providerOptions;
  });
  const selected = options.find((item) => `${item.provider}:${item.value}` === selectedValue);
  return selected && !visible.some((item) => `${item.provider}:${item.value}` === selectedValue) ? [selected, ...visible] : visible;
}

function hasRecommendedVoice(options, provider) {
  return options.some((item) => item.provider === provider && isRecommendedVoice(item));
}

function tokenizeWords(text = "") {
  return [...text.matchAll(/\S+/g)].map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
}

function wordIndexAtOffset(text, offset) {
  const words = tokenizeWords(text);
  if (!words.length) return -1;
  const index = words.findIndex((word) => offset >= word.start && offset < word.end);
  if (index >= 0) return index;
  const nextIndex = words.findIndex((word) => word.start > offset);
  return nextIndex >= 0 ? nextIndex : words.length - 1;
}

function wordIndexAtProgress(text, elapsedSeconds, durationSeconds) {
  const words = tokenizeWords(text);
  if (!words.length || !durationSeconds) return -1;
  return Math.min(words.length - 1, Math.floor((elapsedSeconds / durationSeconds) * words.length));
}

function renderWordSpans(text, active, activeWordIndex) {
  if (!active) return text;
  const words = tokenizeWords(text);
  if (!words.length) return text;
  const parts = [];
  let cursor = 0;
  words.forEach((word, index) => {
    if (word.start > cursor) parts.push(text.slice(cursor, word.start));
    parts.push(<span key={`${word.start}-${word.end}`} className={index === activeWordIndex ? "reader-word-highlight" : ""}>{word.text}</span>);
    cursor = word.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export function Reader({ documentBundle, onProgressSaved, onRefresh }) {
  const { document, chunks, sections = [], bookmarks } = documentBundle;
  const [chunkIndex, setChunkIndex] = useState(document.current_chunk || 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [fontSize, setFontSize] = useState(17);
  const [lineHeight, setLineHeight] = useState(1.8);
  const [fontFamily, setFontFamily] = useState("sans");
  const [skipLowConfidence, setSkipLowConfidence] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("playback");
  const [voice, setVoice] = useState(fallbackBrowserVoice);
  const [showAllVoices, setShowAllVoices] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [browserVoices, setBrowserVoices] = useState([]);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [elapsed, setElapsed] = useState(document.current_offset_seconds || 0);
  const [podcast, setPodcast] = useState(null);
  const [settings, setSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [localSections, setLocalSections] = useState(sections);
  const [organizing, setOrganizing] = useState(false);
  const [downloadState, setDownloadState] = useState({ status: "idle", message: "", url: "" });
  const browserVoiceOptions = useMemo(
    () => browserVoices.map((item) => ({
      label: `Browser ${item.name} (${item.lang})`,
      value: item.voiceURI || item.name,
      voiceName: item.name,
      provider: "browser"
    })),
    [browserVoices]
  );
  const availableVoices = useMemo(() => [
    ...(settings?.capabilities?.systemVoice ? (settings.capabilities.systemVoices || []).map((item) => ({ label: `Local Mac ${item}`, value: item, provider: "system" })) : []),
    ...(browserVoiceOptions.length ? browserVoiceOptions : [fallbackBrowserVoice]),
    ...providerVoices,
    ...(settings?.capabilities?.kokoro ? (settings.capabilities.kokoro.voices || kokoroVoices).map((item) => ({ label: `Kokoro ${item}`, value: item, provider: "kokoro" })) : [])
  ], [browserVoiceOptions, settings?.capabilities?.kokoro, settings?.capabilities?.systemVoice, settings?.capabilities?.systemVoices]);
  const visibleVoices = useMemo(
    () => visibleVoiceOptions(availableVoices, showAllVoices, `${voice.provider}:${voice.value}`),
    [availableVoices, showAllVoices, voice]
  );
  const audioRef = useRef(null);
  const utteranceRef = useRef(null);
  const activeRef = useRef(null);
  const isPlayingRef = useRef(false);
  const chunkIndexRef = useRef(document.current_chunk || 0);
  const activeChunksRef = useRef(chunks);
  const podcastRef = useRef(null);
  const documentChunkRef = useRef(document.current_chunk || 0);
  const speechTimerRef = useRef(null);

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
  const currentTotalSeconds = Math.min(totalSeconds, completedSeconds + elapsed);
  const readingFont = fontFamily === "serif"
    ? "Georgia, Cambria, Times New Roman, serif"
    : fontFamily === "dyslexic"
      ? "OpenDyslexic, Lexie Readable, Arial, sans-serif"
      : "Inter, ui-sans-serif, system-ui, sans-serif";

  function estimatedChunkDuration(text = activeChunk?.text) {
    return Number(activeChunk?.estimated_seconds || activeChunk?.estimatedSeconds || Math.max(1, text?.split(/\s+/).filter(Boolean).length / 2.5)) / speed;
  }

  function updateEstimatedWord(seconds, duration = estimatedChunkDuration()) {
    setActiveWordIndex(wordIndexAtProgress(activeChunk?.text || "", seconds, duration));
  }

  function clearSpeechTimer() {
    if (speechTimerRef.current) window.clearInterval(speechTimerRef.current);
    speechTimerRef.current = null;
  }

  function startSpeechTimer(text) {
    clearSpeechTimer();
    const duration = estimatedChunkDuration(text);
    const startedAt = performance.now() - (elapsed * 1000);
    speechTimerRef.current = window.setInterval(() => {
      if (!isPlayingRef.current) return;
      const seconds = Math.min(duration, (performance.now() - startedAt) / 1000);
      setElapsed(seconds);
      updateEstimatedWord(seconds, duration);
    }, 80);
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    // Reset karaoke state when the active chunk changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveWordIndex(-1);
  }, [chunkIndex, podcast]);

  useEffect(() => {
    chunkIndexRef.current = chunkIndex;
    activeChunksRef.current = activeChunks;
    podcastRef.current = podcast;
    if (!podcast) documentChunkRef.current = chunkIndex;
  }, [activeChunks, chunkIndex, podcast]);

  useEffect(() => {
    function refreshBrowserVoices() {
      setBrowserVoices(window.speechSynthesis.getVoices());
    }

    refreshBrowserVoices();
    window.speechSynthesis.addEventListener("voiceschanged", refreshBrowserVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", refreshBrowserVoices);
  }, []);

  useEffect(() => {
    api("/api/settings")
      .then((data) => setSettings(data.settings))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!settings) return;
    const capabilities = settings.capabilities;
    let nextVoice;
    if (settings.ttsProvider === "openai" && settings.hasOpenaiApiKey) {
      nextVoice = voiceForProvider("openai", settings.openaiTtsVoice, availableVoices);
    } else if (settings.ttsProvider === "elevenlabs" && settings.hasElevenLabsApiKey) {
      nextVoice = voiceForProvider("elevenlabs", settings.elevenLabsVoiceId, availableVoices);
    } else if (settings.ttsProvider === "system" && capabilities?.systemVoice) {
      nextVoice = voiceForProvider("system", settings.systemVoice, availableVoices);
    } else if (settings.ttsProvider === "kokoro" && capabilities?.kokoro) {
      nextVoice = voiceForProvider("kokoro", settings.kokoroVoice, availableVoices);
    } else {
      const recommended = preferredBrowserVoice(browserVoices);
      nextVoice = voiceForProvider("browser", settings.browserVoice || recommended?.voiceURI || recommended?.name, availableVoices);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoice(nextVoice);
  }, [availableVoices, browserVoices, settings]);

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
    if (skipLowConfidence && isLowConfidence(activeChunk)) {
      const next = findPlayableIndex(chunkIndex, 1);
      if (next !== chunkIndex) {
        setChunkIndex(next);
        setElapsed(0);
        setTimeout(() => playChunk(next), 50);
        return;
      }
    }
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
    setActiveWordIndex(wordIndexAtProgress(text, elapsed, estimatedChunkDuration(text)));
    const utterance = new SpeechSynthesisUtterance(text);
    const selected = browserVoices.find((candidate) => (candidate.voiceURI || candidate.name) === voice.value || candidate.name === voice.voiceName)
      || preferredBrowserVoice(browserVoices);
    utterance.voice = selected || null;
    if (selected?.lang) utterance.lang = selected.lang;
    utterance.rate = speed;
    utterance.pitch = 1 + pitch;
    utterance.onend = () => {
      clearSpeechTimer();
      nextChunk();
    };
    utterance.onboundary = (event) => {
      if (event.name === "word") {
        const offset = Number(event.charIndex || 0);
        setActiveWordIndex(wordIndexAtOffset(text, offset));
        setElapsed(Math.min(estimatedChunkDuration(text), (offset / Math.max(text.length, 1)) * estimatedChunkDuration(text)));
      }
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    startSpeechTimer(text);
  }

  function pause() {
    setIsPlaying(false);
    isPlayingRef.current = false;
    audioRef.current?.pause();
    clearSpeechTimer();
    window.speechSynthesis.pause();
    saveProgress(chunkIndex, elapsed);
  }

  function stopPlayback() {
    setIsPlaying(false);
    isPlayingRef.current = false;
    audioRef.current?.pause();
    clearSpeechTimer();
    setActiveWordIndex(-1);
    window.speechSynthesis.cancel();
  }

  function nextChunk() {
    clearSpeechTimer();
    const currentIndex = chunkIndexRef.current;
    const currentChunks = activeChunksRef.current;
    const next = skipLowConfidence ? findPlayableIndex(currentIndex, 1) : Math.min(currentChunks.length - 1, currentIndex + 1);
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

  function skipBySeconds(seconds) {
    const audio = audioRef.current;
    if (voice.provider !== "browser" && audio?.src) {
      audio.currentTime = Math.max(0, audio.currentTime + seconds);
      setElapsed(audio.currentTime);
      updateEstimatedWord(audio.currentTime, audio.duration || estimatedChunkDuration());
      return;
    }
    seekToTotalSeconds(currentTotalSeconds + seconds);
  }

  function seekToTotalSeconds(targetSeconds) {
    const target = Math.max(0, Math.min(totalSeconds, targetSeconds));
    let accumulated = 0;
    let nextIndex = 0;
    let offset = 0;
    for (let index = 0; index < activeChunks.length; index += 1) {
      const duration = Number(activeChunks[index].estimated_seconds || activeChunks[index].estimatedSeconds || 0);
      if (target <= accumulated + duration || index === activeChunks.length - 1) {
        nextIndex = index;
        offset = Math.max(0, target - accumulated);
        break;
      }
      accumulated += duration;
    }
    setChunkIndex(nextIndex);
    setElapsed(offset);
    if (voice.provider !== "browser" && audioRef.current?.src && nextIndex === chunkIndex) {
      audioRef.current.currentTime = offset;
      updateEstimatedWord(offset, audioRef.current.duration || Number(activeChunks[nextIndex].estimated_seconds || activeChunks[nextIndex].estimatedSeconds || 1) / speed);
    } else if (isPlaying) {
      window.speechSynthesis.cancel();
      setTimeout(() => playChunk(nextIndex), 50);
    }
  }

  function findPlayableIndex(startIndex, direction) {
    const currentChunks = activeChunksRef.current;
    let index = startIndex + direction;
    while (index >= 0 && index < currentChunks.length && isLowConfidence(currentChunks[index])) index += direction;
    return Math.max(0, Math.min(currentChunks.length - 1, index));
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
      setVoice(voiceForProvider("openai", data.settings.openaiTtsVoice, availableVoices));
    } else if (nextProvider === "elevenlabs") {
      setVoice(voiceForProvider("elevenlabs", data.settings.elevenLabsVoiceId, availableVoices));
    } else if (nextProvider === "system" && data.settings.capabilities?.systemVoice) {
      setVoice(voiceForProvider("system", data.settings.systemVoice, availableVoices));
    } else if (nextProvider === "kokoro") {
      setVoice(voiceForProvider("kokoro", data.settings.kokoroVoice, availableVoices));
    } else {
      const recommended = preferredBrowserVoice(browserVoices);
      setVoice(voiceForProvider("browser", data.settings.browserVoice || recommended?.voiceURI || recommended?.name, availableVoices));
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
      <div className="border-b border-[#2a3340]/60 bg-[#111720] px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-white">{podcast ? `Podcast: ${document.title}` : document.title}</p>
            <p className="text-xs text-[#9aa8b7]">{document.word_count} words · {activeChunks.length} chunks · {formatTime(completedSeconds + elapsed)} elapsed</p>
          </div>
          <div className="flex items-center gap-2">
            {podcast && (
              <button title="Back to document" onClick={exitPodcastMode} className="inline-flex items-center gap-2 rounded-md border border-[#2a3340]/60 px-3 py-2 text-sm text-[#cbd5df] hover:bg-[#1b222c]">
                <FileText className="h-4 w-4" />
                Document
              </button>
            )}
            <button title="Podcast mode" onClick={startPodcastMode} className="rounded-md border border-[#2a3340]/60 p-2 text-[#f0b35b] hover:bg-[#1b222c]">
              {loadingAudio ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            </button>
            <button title="Settings" onClick={() => setShowSettings(true)} className="rounded-md border border-[#2a3340]/60 p-2 text-[#9aa8b7] hover:bg-[#1b222c]">
              <Settings className="h-4 w-4" />
            </button>
            <button title="Generate offline audio" onClick={generateDownload} className="rounded-md border border-[#2a3340]/60 p-2 text-[#9aa8b7] hover:bg-[#1b222c]">
              {downloadState.status === "working" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </button>
            <button title="Organize document" onClick={organizeCurrentDocument} className="rounded-md border border-[#2a3340]/60 p-2 text-[#9aa8b7] hover:bg-[#1b222c]">
              {organizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            </button>
            <button title="Bookmark" onClick={addBookmark} className="rounded-md border border-[#2a3340]/60 p-2 text-[#9aa8b7] hover:bg-[#1b222c]">
              <Bookmark className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#26313f]">
          <div className="h-full rounded-full bg-[#61d6bd]" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="scrollbar-thin overflow-y-auto p-4 pb-36 md:p-8 md:pb-36">
          <div className="mx-auto max-w-[78ch] space-y-3" style={{ fontSize: `${fontSize}px`, lineHeight, fontFamily: readingFont }}>
            {activeChunks.map((chunk, index) => {
              const qualityFlagged = isQualityFlagged(chunk);
              return (
              <div key={`${podcast ? "podcast" : document.id}-${index}`}>
                {activeSections.some((section) => sectionStart(section) === index) && (
                  <div className="mb-3 mt-6 border-b border-[#2a3340]/60 pb-3">
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
                  className={`w-full border border-transparent text-left transition ${
                    index === chunkIndex ? "text-white" : "bg-transparent text-[#cbd5df] hover:bg-[#151a21]"
                  }`}
                >
                  <span className={index === chunkIndex ? "reader-highlight" : ""}>{renderWordSpans(chunk.text, index === chunkIndex, activeWordIndex)}</span>
                  {qualityFlagged && <span className="mt-3 block text-xs leading-5 text-[#d8ae6a]">Quality review: {qualityReasons(chunk).join(", ") || "possible OCR or front/back matter"}. Playback still includes this chunk unless skipping is enabled in Reading.</span>}
                </button>
              </div>
              );
            })}
          </div>
        </div>

        <aside className="border-t border-[#2a3340]/60 bg-[#10161e]/80 p-4 md:border-l md:border-t-0 md:p-5">
          <div className="sticky top-4 space-y-4">
            <div className="grid grid-cols-4 border-b border-[#2a3340]/60">
              {[{ id: "playback", label: "Playback", icon: Volume2 }, { id: "reading", label: "Reading", icon: Type }, { id: "sections", label: "Sections", icon: AlignJustify }, { id: "bookmarks", label: "Saved", icon: Bookmark }].map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setSidebarTab(id)} className={`flex min-w-0 flex-col items-center gap-1 border-b-2 px-1 py-2 text-[11px] ${sidebarTab === id ? "border-[#61d6bd] text-white" : "border-transparent text-[#788694] hover:text-[#cbd5df]"}`}>
                  <Icon className="h-4 w-4" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>

            {sidebarTab === "playback" && (
              <div className="space-y-4">
                <label className="block text-sm text-[#cbd5df]">
                  <span className="mb-2 flex items-center gap-2"><Volume2 className="h-4 w-4" />Voice</span>
                  <select value={`${voice.provider}:${voice.value}`} onChange={(event) => setVoice(availableVoices.find((item) => `${item.provider}:${item.value}` === event.target.value) || fallbackBrowserVoice)} className="w-full rounded-md border border-[#2a3340]/70 bg-[#151a21] px-3 py-2 text-white">
                    {visibleVoices.map((item) => <option key={`${item.provider}:${item.value}`} value={`${item.provider}:${item.value}`}>{item.label}</option>)}
                  </select>
                  <label className="mt-2 flex items-center gap-2 text-xs text-[#9aa8b7]">
                    <input type="checkbox" checked={showAllVoices} onChange={(event) => setShowAllVoices(event.target.checked)} className="accent-[#61d6bd]" />
                    Show all voices
                  </label>
                  {!showAllVoices && !hasRecommendedVoice(availableVoices, voice.provider) && <p className="mt-2 text-xs leading-5 text-[#d8ae6a]">No curated voice is installed for this provider, so all available voices are shown.</p>}
                </label>
                <Range label={`Speed ${speed.toFixed(2)}x`} min="0.75" max="2" step="0.05" value={speed} onChange={setSpeed} />
                <Range label={`Pitch ${pitch.toFixed(2)}`} min="-0.2" max="0.2" step="0.01" value={pitch} onChange={setPitch} />
                {voice.provider === "openai" && !settings?.hasOpenaiApiKey && <button onClick={() => setShowSettings(true)} className="w-full rounded-md border border-[#614426]/70 bg-[#22170b]/70 p-3 text-left text-xs text-[#f0d7ad]">Add your OpenAI API key in Settings to use hosted voices.</button>}
                <div className="border border-[#2a3340]/60 p-3">
                  <button onClick={generateDownload} disabled={downloadState.status === "working"} className="flex w-full items-center justify-center gap-2 rounded-md border border-[#718190]/70 px-3 py-2 text-sm text-[#d6dde5] hover:bg-[#1b222c] disabled:opacity-60">
                    {downloadState.status === "working" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Offline audio export
                  </button>
                  {downloadState.message && <p className={`mt-2 text-xs leading-5 ${downloadState.status === "error" ? "text-red-200" : "text-[#9aa8b7]"}`}>{downloadState.message}</p>}
                  {downloadState.url && <a href={downloadState.url} download className="mt-2 block border border-[#2a3340]/70 px-3 py-2 text-center text-sm text-white hover:bg-[#1b222c]">Download file</a>}
                </div>
              </div>
            )}

            {sidebarTab === "reading" && <ReadingControls fontSize={fontSize} setFontSize={setFontSize} lineHeight={lineHeight} setLineHeight={setLineHeight} fontFamily={fontFamily} setFontFamily={setFontFamily} skipLowConfidence={skipLowConfidence} setSkipLowConfidence={setSkipLowConfidence} />}

            {sidebarTab === "sections" && <SectionList sections={activeSections} chunkIndex={chunkIndex} sectionForChunk={sectionForChunk} organize={organizeCurrentDocument} organizing={organizing} onSelect={(index) => { setChunkIndex(index); setElapsed(0); stopPlayback(); }} />}

            {sidebarTab === "bookmarks" && <BookmarkList bookmarks={bookmarks} onSelect={(index) => { setChunkIndex(index); setElapsed(0); stopPlayback(); }} />}
          </div>
          <audio
            ref={audioRef}
            onTimeUpdate={(event) => {
              const seconds = event.currentTarget.currentTime;
              setElapsed(seconds);
              updateEstimatedWord(seconds, event.currentTarget.duration || estimatedChunkDuration());
            }}
            onEnded={nextChunk}
            onPause={() => saveProgress(chunkIndex, audioRef.current?.currentTime || elapsed)}
          />
        </aside>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#2a3340]/70 bg-[#0f141b]/95 px-4 py-3 shadow-[0_-10px_30px_rgba(0,0,0,0.22)] backdrop-blur md:left-80 md:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <button title="Skip back 15 seconds" onClick={() => skipBySeconds(-15)} className="rounded-md border border-[#718190]/70 p-2 text-[#cbd5df] hover:bg-[#1b222c]"><RotateCcw className="h-4 w-4" /></button>
          <button title={isPlaying ? "Pause" : "Play"} onClick={isPlaying ? pause : play} className="rounded-md bg-[#61d6bd] p-3 text-[#07100d] hover:bg-[#73e4cd]">
            {loadingAudio ? <Loader2 className="h-5 w-5 animate-spin" /> : isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button title="Skip forward 15 seconds" onClick={() => skipBySeconds(15)} className="rounded-md border border-[#718190]/70 p-2 text-[#cbd5df] hover:bg-[#1b222c]"><RotateCw className="h-4 w-4" /></button>
          <div className="min-w-[180px] flex-1">
            <input aria-label="Reading progress" type="range" min="0" max={Math.max(totalSeconds, 1)} step="1" value={currentTotalSeconds} onChange={(event) => seekToTotalSeconds(Number(event.target.value))} className="w-full accent-[#61d6bd]" />
          </div>
          <span className="min-w-[92px] text-right text-xs tabular-nums text-[#cbd5df]">{formatTime(currentTotalSeconds)} / {formatTime(totalSeconds)}</span>
        </div>
      </div>
      {showSettings && (
        <SettingsPanel
          settings={settings}
          saved={settingsSaved}
          onClose={() => setShowSettings(false)}
          onSave={saveSettings}
          browserVoiceOptions={browserVoiceOptions}
          systemVoiceOptions={settings?.capabilities?.systemVoice ? (settings.capabilities.systemVoices || []).map((item) => ({ label: item, value: item, voiceName: item, provider: "system" })) : []}
          showAllVoices={showAllVoices}
          setShowAllVoices={setShowAllVoices}
        />
      )}
    </section>
  );
}

function SettingsPanel({ settings, saved, onClose, onSave, browserVoiceOptions, systemVoiceOptions, showAllVoices, setShowAllVoices }) {
  const systemOptions = visibleVoiceOptions(systemVoiceOptions, showAllVoices, `system:${settings?.systemVoice || ""}`);
  const browserOptions = visibleVoiceOptions(browserVoiceOptions, showAllVoices, `browser:${settings?.browserVoice || ""}`);
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

        <label className="mb-4 flex items-center gap-2 text-xs text-[#9aa8b7]">
          <input type="checkbox" checked={showAllVoices} onChange={(event) => setShowAllVoices(event.target.checked)} className="accent-[#61d6bd]" />
          Show all detected voices
        </label>

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
              {settings?.capabilities?.kokoro && <option value="kokoro">Kokoro {settings.capabilities.kokoro.available ? "(ready)" : "(download on first use)"}</option>}
              <option value="openai">OpenAI</option>
              <option value="elevenlabs">ElevenLabs</option>
            </select>
          </label>

          {settings?.capabilities?.systemVoice && (
            <div className="rounded-lg border border-[#2a3340] p-4">
              <p className="mb-3 text-sm font-semibold text-white">No-key local voice</p>
              <label className="block text-sm text-[#cbd5df]">
                <span className="mb-2 block">macOS system voice</span>
                <select name="systemVoice" defaultValue={settings?.systemVoice || "Reed (English (US))"} className="w-full rounded-md border border-[#2a3340] bg-[#151a21] px-3 py-2 text-white">
                  {systemOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                {!showAllVoices && !hasRecommendedVoice(systemVoiceOptions, "system") && <span className="mt-2 block text-xs leading-5 text-[#d8ae6a]">No curated voice is installed, so all available local voices are shown.</span>}
                <span className="mt-2 block text-xs leading-5 text-[#9aa8b7]">For a more natural free voice, install an Enhanced or Premium voice in System Settings &gt; Accessibility &gt; Spoken Content &gt; System Voice &gt; Manage Voices.</span>
              </label>
            </div>
          )}

          <div className="rounded-lg border border-[#2a3340] p-4">
            <p className="mb-3 text-sm font-semibold text-white">Browser Web Speech</p>
            <label className="block text-sm text-[#cbd5df]">
              <span className="mb-2 block">Browser voice</span>
              <select name="browserVoice" defaultValue={settings?.browserVoice || browserVoiceOptions[0]?.value || ""} className="w-full rounded-md border border-[#2a3340] bg-[#151a21] px-3 py-2 text-white">
                {browserOptions.length ? browserOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>) : <option value="">Browser default</option>}
              </select>
              {!showAllVoices && browserVoiceOptions.length > 0 && !hasRecommendedVoice(browserVoiceOptions, "browser") && <span className="mt-2 block text-xs leading-5 text-[#d8ae6a]">No curated voice is installed, so all available browser voices are shown.</span>}
              <span className="mt-2 block text-xs leading-5 text-[#9aa8b7]">Voice quality comes from your browser and operating system. Browser Web Speech is the suggested free default.</span>
            </label>
          </div>

          <div className="rounded-lg border border-[#2a3340] p-4">
            <p className="mb-3 text-sm font-semibold text-white">Kokoro local neural voice</p>
            <label className="block text-sm text-[#cbd5df]">
              <span className="mb-2 block">Voice</span>
              <select name="kokoroVoice" defaultValue={settings?.kokoroVoice || "af_heart"} className="w-full rounded-md border border-[#2a3340] bg-[#151a21] px-3 py-2 text-white">
                {kokoroVoices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
              </select>
              <span className="mt-2 block text-xs leading-5 text-[#9aa8b7]">{settings?.capabilities?.kokoro?.available ? "Model ready. Audio is generated locally on the server." : "Model is not downloaded yet. The first Kokoro playback downloads about 86 MB into storage/models/kokoro/."}</span>
            </label>
          </div>

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
                {visibleVoiceOptions(providerVoices.filter((item) => item.provider === "openai"), showAllVoices, `openai:${settings?.openaiTtsVoice || ""}`).map((item) => <option key={item.value} value={item.value}>{item.value}</option>)}
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

function ReadingControls({ fontSize, setFontSize, lineHeight, setLineHeight, fontFamily, setFontFamily, skipLowConfidence, setSkipLowConfidence }) {
  return (
    <div className="space-y-5 text-sm text-[#cbd5df]">
      <div>
        <p className="mb-2 flex items-center gap-2 font-medium text-white"><Type className="h-4 w-4" />Text size</p>
        <div className="flex items-center gap-2">
          <button aria-label="Decrease font size" onClick={() => setFontSize(Math.max(15, fontSize - 1))} className="border border-[#718190]/70 px-3 py-2 text-lg hover:bg-[#1b222c]">A-</button>
          <span className="min-w-12 text-center tabular-nums text-xs text-[#9aa8b7]">{fontSize}px</span>
          <button aria-label="Increase font size" onClick={() => setFontSize(Math.min(23, fontSize + 1))} className="border border-[#718190]/70 px-3 py-2 text-lg hover:bg-[#1b222c]">A+</button>
        </div>
      </div>
      <div>
        <p className="mb-2 flex items-center gap-2 font-medium text-white"><AlignJustify className="h-4 w-4" />Line spacing</p>
        <div className="grid grid-cols-3 gap-1">
          {[{ value: 1.55, label: "Tight" }, { value: 1.8, label: "Comfort" }, { value: 2.05, label: "Open" }].map((option) => <button key={option.value} onClick={() => setLineHeight(option.value)} className={`border px-2 py-2 text-xs ${lineHeight === option.value ? "border-[#61d6bd] text-white" : "border-[#718190]/60 text-[#9aa8b7] hover:bg-[#1b222c]"}`}>{option.label}</button>)}
        </div>
      </div>
      <label className="block">
        <span className="mb-2 block font-medium text-white">Font family</span>
        <select value={fontFamily} onChange={(event) => setFontFamily(event.target.value)} className="w-full border border-[#2a3340]/70 bg-[#151a21] px-3 py-2 text-white">
          <option value="sans">Sans-serif</option>
          <option value="serif">Serif</option>
          <option value="dyslexic">OpenDyslexic (if installed)</option>
        </select>
      </label>
      <label className="flex items-start gap-2 border-t border-[#2a3340]/60 pt-4 text-xs leading-5 text-[#cbd5df]">
        <input type="checkbox" checked={skipLowConfidence} onChange={(event) => setSkipLowConfidence(event.target.checked)} className="mt-1 accent-[#61d6bd]" />
        <span><span className="block font-medium text-white">Skip flagged chunks during playback</span>Quality flags are advisory and remain visible in the document.</span>
      </label>
      <p className="text-xs leading-5 text-[#788694]">Reading width is capped at about 70-80 characters to reduce eye travel.</p>
    </div>
  );
}

function SectionList({ sections, chunkIndex, sectionForChunk, organize, organizing, onSelect }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">Document sections</p>
        <button title="Organize document" onClick={organize} className="border border-[#718190]/70 p-1.5 text-[#9aa8b7] hover:bg-[#1b222c]">{organizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}</button>
      </div>
      <div className="max-h-[calc(100dvh-240px)] space-y-2 overflow-y-auto pr-1">
        {sections.map((section) => <button key={section.id} onClick={() => onSelect(sectionStart(section))} className={`w-full border p-2 text-left text-xs hover:bg-[#1b222c] ${chunkIndex >= sectionStart(section) && chunkIndex <= sectionEnd(section) ? "border-[#61d6bd]/70 text-white" : "border-[#2a3340]/60 text-[#cbd5df]"}`}><span className="block truncate">{section.title}</span>{sectionForChunk(sectionStart(section))?.summary && <span className="mt-1 block line-clamp-2 text-[#788694]">{section.summary}</span>}</button>)}
        {!sections.length && <p className="text-xs text-[#9aa8b7]">No sections yet. Organize the document to create them.</p>}
      </div>
    </div>
  );
}

function BookmarkList({ bookmarks, onSelect }) {
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-white">Saved bookmarks</p>
      <div className="space-y-2">
        {bookmarks?.map((bookmark) => <button key={bookmark.id} onClick={() => onSelect(bookmark.chunk_index)} className="w-full border border-[#2a3340]/60 p-2 text-left text-xs text-[#cbd5df] hover:bg-[#1b222c]">{bookmark.label}</button>)}
        {!bookmarks?.length && <p className="text-xs text-[#9aa8b7]">No bookmarks saved.</p>}
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

function isLowConfidence(chunk) {
  return chunk?.quality_status === "low" || Number(chunk?.quality_score ?? 1) < 0.55;
}

function isQualityFlagged(chunk) {
  return isLowConfidence(chunk) || chunk?.quality_status === "review";
}

function qualityReasons(chunk) {
  if (Array.isArray(chunk?.quality_reasons)) return chunk.quality_reasons;
  try {
    return JSON.parse(chunk?.quality_reasons || "[]");
  } catch {
    return [];
  }
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
