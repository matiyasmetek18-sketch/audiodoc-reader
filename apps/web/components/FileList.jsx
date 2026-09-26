"use client";

import { BookOpen, Clock } from "lucide-react";
import { formatMinutes } from "../lib/format";

export function FileList({ documents, selectedId, onSelect }) {
  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <button
          key={doc.id}
          onClick={() => onSelect(doc.id)}
          className={`w-full rounded-lg border p-3 text-left transition ${
            selectedId === doc.id ? "border-[#61d6bd] bg-[#162922]" : "border-[#2a3340] bg-[#151a21] hover:bg-[#1b222c]"
          }`}
        >
          <div className="flex items-start gap-3">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#f0b35b]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{doc.title}</p>
              <div className="mt-2 flex items-center gap-3 text-xs text-[#9aa8b7]">
                <span>{doc.chunk_count || 0} chunks</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatMinutes(doc.estimated_minutes)}
                </span>
              </div>
            </div>
          </div>
        </button>
      ))}
      {!documents.length && <p className="rounded-lg border border-[#2a3340] p-4 text-sm text-[#9aa8b7]">No documents yet.</p>}
    </div>
  );
}
