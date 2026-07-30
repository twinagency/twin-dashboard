export default function TwinWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-2 whitespace-nowrap leading-none text-black ${className}`}>
      <span
        className="text-[20px] font-bold tracking-[-0.025em]"
        style={{ fontFamily: "var(--font-display), var(--font-sans), sans-serif" }}
      >
        Twin.
      </span>
      <span className="text-[13px] font-bold uppercase tracking-[0.28em] text-black/70">
        Technologies
      </span>
    </span>
  );
}
