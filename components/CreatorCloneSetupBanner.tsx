import { Check, Sparkles } from "lucide-react";

export default function CreatorCloneSetupBanner({ brand }: { brand: "moxy" | "flirt" }) {
  return (
    <section role="status" aria-label="AI clone setup status" data-creator-clone-building
      className={`relative mb-6 overflow-hidden rounded-2xl border p-6 text-white shadow-lg sm:p-8 ${brand === "moxy" ? "border-[#8D394D] bg-gradient-to-br from-[#572030] to-[#28151c]" : "border-[#e54b67] bg-gradient-to-br from-[#a51d3a] to-[#421321]"}`}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 size-64 rounded-full border border-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-3 -top-7 size-44 rounded-full border border-white/10" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:gap-6">
        <div aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
          <Sparkles size={28} strokeWidth={1.6} />
        </div>
        <div className="min-w-0">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/85">
            <Check size={15} aria-hidden="true" /> Onboarding submitted
          </p>
          <h2 className="max-w-2xl text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">Your AI clone is being created.</h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/90">Thanks for getting started. We’ll notify you as soon as your clone is ready.</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80">In the meantime, explore your dashboard for everything you need. You can still update your details and add more content.</p>
          <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-white" /> Setup in progress
          </span>
        </div>
      </div>
    </section>
  );
}
