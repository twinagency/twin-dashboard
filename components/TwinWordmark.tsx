import { isLynq, isMoxy } from "@/lib/agency-brand";
import { JESS_KATE_PORTAL, TETHER_PORTAL } from "@/lib/partner-portals";
import IntelligenceCoreIcon from "@/components/IntelligenceCoreIcon";

export default function TwinWordmark({
  className = "",
  descriptor = "Technologies",
  inverse = false,
  agencyName,
  studio = false,
}: {
  className?: string;
  descriptor?: string;
  inverse?: boolean;
  agencyName?: string;
  studio?: boolean;
}) {
  if (isMoxy(agencyName)) return <img src={inverse ? "/moxy/moxy-ai-light.svg" : "/moxy/moxy-ai-dark.svg"} alt="Moxy AI, Los Angeles and Miami" width={1176} height={447} className={`block h-auto w-40 max-w-full ${className}`} />;
  if (isLynq(agencyName)) {
    return (
      <span className={`lynq-wordmark inline-flex items-center gap-2.5 leading-none ${className}`} aria-label="LYNQ">
        <span data-lynq-core="particles" aria-hidden="true"><IntelligenceCoreIcon size={inverse ? 48 : 40} /></span>
        <span
          className="text-[21px] font-extrabold tracking-[0.18em] text-[#19191f]"
          style={{ fontFamily: "var(--font-display), var(--font-sans), sans-serif" }}
        >
          LYNQ
        </span>
      </span>
    );
  }
  if (agencyName === JESS_KATE_PORTAL.name) {
    return (
      <span
        aria-label="Ava"
        className={`inline-block leading-none ${inverse ? "text-[#f7f2ec]" : "text-[#3f0c1c]"} ${className}`}
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: "italic",
          fontSize: "34px",
          fontWeight: 700,
          letterSpacing: "-0.06em",
        }}
      >
        Ava
      </span>
    );
  }
  if (agencyName === TETHER_PORTAL.name) {
    return (
      <span
        aria-label="Tether"
        className={`inline-block leading-none ${inverse ? "text-white" : "text-[#080a0e]"} ${className}`}
        style={{
          fontFamily: "var(--font-display), var(--font-sans), sans-serif",
          fontSize: "24px",
          fontWeight: 700,
          letterSpacing: "-0.045em",
        }}
      >
        Tether.
      </span>
    );
  }
  if (studio && !agencyName) return <span className="studio-wordmark" aria-label="Twin Technologies"><strong>Twin</strong><span>TECHNOLOGIES</span></span>;
  return (
    <span
      className={`inline-flex items-baseline gap-2 ${agencyName ? "whitespace-normal" : "whitespace-nowrap"} leading-none ${inverse ? "text-white" : "text-black"} ${className}`}
    >
      <span
        className="text-[20px] font-bold tracking-[-0.025em]"
        style={{ fontFamily: "var(--font-display), var(--font-sans), sans-serif" }}
      >
        {agencyName || "Twin"}
      </span>
      {!agencyName && <span className={`text-[13px] font-bold uppercase tracking-[0.28em] ${inverse ? "text-white/72" : "text-black/70"}`}>
        {descriptor}
      </span>}
    </span>
  );
}
