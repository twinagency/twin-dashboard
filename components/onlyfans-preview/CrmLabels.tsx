export type Tone = "navy" | "blue" | "green" | "pink" | "slate" | "gold";

export const TONE: Record<Tone, string> = {
  navy: "bg-[#0b2b4b] text-white",
  blue: "bg-[#edf3fc] text-[#2f6fed]",
  green: "bg-[#e8f5f0] text-[#138a63]",
  pink: "bg-[#fff4f8] text-[#9b2f62]",
  slate: "bg-[#eef2f6] text-[#607086]",
  gold: "bg-[#fff6e5] text-[#9a6810]",
};

export function QuietLabel({ children, tone = "slate" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold ${TONE[tone]}`}>{children}</span>;
}
