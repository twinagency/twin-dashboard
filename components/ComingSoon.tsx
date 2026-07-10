export default function ComingSoon({ title, note }: { title: string; note?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-16 text-center dark:border-neutral-800 dark:bg-neutral-900">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-neutral-100">{title}</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">{note ?? "Coming soon."}</p>
    </div>
  );
}
