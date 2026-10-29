import { RefreshCw } from "lucide-react";
import { PREVIEW_COPY, type PreviewState } from "@/lib/onlyfans/section8";

/** Terminal or in-progress media preview state. The hint lives in the hover title. */
export default function MediaPreviewState({ state, onRetry, mediaId }: { state: PreviewState; onRetry?: () => void; mediaId?: string }) {
  const copy = PREVIEW_COPY[state];
  return <div className="of-preview-pending" role="status" data-of-preview-pending={mediaId} data-of-preview-state={state} title={copy.hint}>
    <span>{copy.title}</span>
    {copy.retryable && onRetry ? <button type="button" onClick={onRetry}><RefreshCw size={14} aria-hidden="true"/>Retry preview</button> : null}
  </div>;
}
