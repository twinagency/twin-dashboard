import AiChat from "./AiChat";

export const dynamic = "force-dynamic";

export default function AiPage() {
  return (
    <div className="text-ink">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">AI Assistant</h1>
        <p className="mt-0.5 text-sm text-muted">
          Ask about revenue, top spenders, recent errors, conversations, fans, settings, campaigns,
          or ask it to turn a feature on or off, pause a clone, or update a fan. Reads are always
          read-only over an allowlisted set of tables. Writes go through the same validated actions
          the rest of the dashboard uses, and every change is shown in the chat and logged.
        </p>
      </div>
      <AiChat />
    </div>
  );
}
