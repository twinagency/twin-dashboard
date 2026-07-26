import AiChat from "./AiChat";

export const dynamic = "force-dynamic";

export default function AiPage() {
  return (
    <div className="text-ink">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">AI Assistant</h1>
        <p className="mt-0.5 text-sm text-muted">
          Ask about revenue, top spenders, recent errors, conversations, fans, settings, campaigns - 
          read-only over the live database.
        </p>
      </div>
      <AiChat />
    </div>
  );
}
