"use client";

import { FileUp, Loader2 } from "lucide-react";

export function UploadDropzone({ onUpload, busy }) {
  async function handleFiles(files) {
    const file = files?.[0];
    if (file) await onUpload(file);
  }

  return (
    <label
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        handleFiles(event.dataTransfer.files);
      }}
      className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[#3b4859] bg-[#111720] p-5 text-center transition hover:border-[#61d6bd]"
    >
      {busy ? <Loader2 className="h-7 w-7 animate-spin text-[#61d6bd]" /> : <FileUp className="h-7 w-7 text-[#61d6bd]" />}
      <div>
        <p className="text-sm font-semibold text-white">Drop PDF, DOCX, or TXT</p>
        <p className="mt-1 text-xs text-[#9aa8b7]">Files up to 100 MB. Large documents are chunked automatically.</p>
      </div>
      <input
        className="sr-only"
        type="file"
        accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={busy}
        onChange={(event) => handleFiles(event.target.files)}
      />
    </label>
  );
}
