"use client";
import { useEffect, useRef, useState } from "react";
import { contentFolderUrl, type ContentFolder } from "@/lib/creator-content-intake";

/** Lives with the upload provider so switching questionnaire tabs cannot drop a link. */
export function useCreatorContentFolders(accountId: string) {
  const key = `creator-content-folder-draft:${accountId}`;
  const draftRef = useRef("");
  const request = useRef<Promise<boolean> | null>(null);
  const [draft, setDraftState] = useState("");
  const [folders, setFolders] = useState<ContentFolder[] | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  function setDraft(value: string) {
    draftRef.current = value; setDraftState(value); setStatus(""); setError(false);
    try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch {}
  }
  function save(): Promise<boolean> {
    if (request.current) return request.current;
    if (!draftRef.current.trim()) return Promise.resolve(true);
    const pending = (async () => {
      setSaving(true);
      while (draftRef.current.trim()) {
        const value = draftRef.current.trim();
        if (!contentFolderUrl(value)) { setStatus("Paste a Google Drive or Dropbox folder link."); setError(true); return false; }
        setStatus("Saving link…"); setError(false);
        try {
          const response = await fetch("/creator-auth/content-folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: value }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Link not saved. Try again.");
          setFolders(result.folders);
          if (draftRef.current.trim() === value) setDraft("");
          setStatus("Folder link saved. Awaiting import by your agency.");
        } catch (reason) { setError(true); setStatus(reason instanceof Error ? reason.message : "Link not saved. Try again."); return false; }
      }
      return true;
    })();
    request.current = pending;
    void pending.finally(() => { request.current = null; setSaving(false); });
    return pending;
  }
  useEffect(() => { try { setDraft(localStorage.getItem(key) || ""); } catch {} }, [key]);
  useEffect(() => { if (!draft.trim()) return; const timer = setTimeout(() => { void save(); }, 900); return () => clearTimeout(timer); }, [draft]);
  return { draft, setDraft, folders, status, error, save, pending: !!draft.trim() || saving };
}
