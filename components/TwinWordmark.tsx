import { isLynq, isMoxy } from "@/lib/agency-brand";
import { JESS_KATE_PORTAL, TETHER_PORTAL } from "@/lib/partner-portals";
import IntelligenceCoreIcon from "@/components/IntelligenceCoreIcon";

export default function TwinWordmark({
  className = "",
  descriptor = "Technologies",
  inverse = false,
  agencyName,
}: {
  className?: string;
  descriptor?: string;
  inverse?: boolean;
  agencyName?: string;
}) {
  if (isMoxy(agencyName)) return <img src="/moxy/logo.png" alt="Moxy, Los Angeles and Miami" width={1100} height={400} className={`block h-auto w-40 max-w-full ${inverse ? "" : "invert"} ${className}`} />;
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
  return <span className={`inline-flex flex-col items-start ${className}`}>
    <img src="/brand/flirt-wordmark-master.png" alt="Flirt" width={1774} height={887}
      className={`block h-14 w-28 object-contain ${inverse ? "invert" : ""}`} />
    {agencyName && !["flirt","twin"].includes(agencyName.toLowerCase()) && <span className="text-xs opacity-70">{agencyName}</span>}
  </span>;
}
