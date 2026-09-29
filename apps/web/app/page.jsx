"use client";

import { useEffect, useState } from "react";
import { Headphones, Loader2, Moon } from "lucide-react";
import { api } from "../lib/api";
import { FileList } from "../components/FileList";
import { Reader } from "../components/Reader";
import { UploadDropzone } from "../components/UploadDropzone";

export default function Home() {
  const [documents, setDocuments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDocuments();
    // The initial library load should run once when the dashboard mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) loadDocument(selectedId);
  }, [selectedId]);

  async function loadDocuments() {
    const data = await api("/api/documents").catch(() => ({ documents: [] }));
    setDocuments(data.documents);
    if (!selectedId && data.documents[0]) setSelectedId(data.documents[0].id);
  }

  async function loadDocument(id) {
    const data = await api(`/api/documents/${id}`);
    setBundle(data);
  }

  async function upload(file) {
    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await api("/api/documents", { method: "POST", body: formData });
      await loadDocuments();
      setSelectedId(data.document.id);
      await loadDocument(data.document.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-[#0c0f14] text-white md:h-screen md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-[#2a3340] bg-[#0f141b] p-4 md:h-screen md:w-80 md:border-b-0 md:border-r">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-[#61d6bd] p-2 text-[#08110f]">
              <Headphones className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold">AudioDoc</h1>
              <p className="text-xs text-[#9aa8b7]">Deep calm document reader</p>
            </div>
          </div>
          <Moon className="h-4 w-4 text-[#9aa8b7]" />
        </div>

        <UploadDropzone onUpload={upload} busy={busy} />
        {error && <p className="mt-3 rounded-md border border-red-900/70 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>}

        <div className="mt-5 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Library</p>
          {busy && <Loader2 className="h-4 w-4 animate-spin text-[#61d6bd]" />}
        </div>
        <div className="scrollbar-thin mt-3 max-h-64 min-h-0 overflow-y-auto md:max-h-none md:flex-1">
          <FileList documents={documents} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </aside>

      <section className="flex min-h-[65dvh] flex-1 md:min-h-0">
        {bundle ? (
          <Reader
            documentBundle={bundle}
            onProgressSaved={loadDocuments}
            onRefresh={() => selectedId && loadDocument(selectedId)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <Headphones className="mx-auto h-10 w-10 text-[#61d6bd]" />
              <p className="mt-4 text-lg font-semibold">Upload a document to begin</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#9aa8b7]">
                AudioDoc extracts clean text, splits long files into speech-ready chunks, and keeps your listening position.
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
