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
  return (
    <span
      className={`inline-flex items-baseline gap-2 whitespace-nowrap leading-none ${inverse ? "text-white" : "text-black"} ${className}`}
    >
      <span
        className="text-[20px] font-bold tracking-[-0.025em]"
        style={{ fontFamily: "var(--font-display), var(--font-sans), sans-serif" }}
      >
        {agencyName || "Twin."}
      </span>
      {!agencyName && <span className={`text-[13px] font-bold uppercase tracking-[0.28em] ${inverse ? "text-white/72" : "text-black/70"}`}>
        {descriptor}
      </span>}
    </span>
  );
}
