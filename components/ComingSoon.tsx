export default function ComingSoon({ title, note }: { title: string; note?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-panel p-16 text-center">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">{note ?? "Coming soon."}</p>
    </div>
  );
}
