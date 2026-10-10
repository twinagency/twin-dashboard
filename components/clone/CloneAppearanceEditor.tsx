"use client";

import { useEffect, useMemo, useState } from "react";
import { FieldLabel, Section } from "@/components/clone/fields";
import { initials } from "@/lib/colors";
import { Camera, LockKeyhole } from "lucide-react";
import studioStyles from "./CreatorStudio.module.css";

const COLORS = ["#06172f", "#0a2540", "#1a4d85", "#4a8ec4", "#78b6df", "#087a61", "#f05a9d", "#c9364f"];

export default function CloneAppearanceEditor({
  cloneName,
  initialColor,
  initialImagePath,
  initialImageUrl,
  studio = false,
}: {
  cloneName: string;
  initialColor: string;
  initialImagePath: string | null;
  initialImageUrl?: string;
  studio?: boolean;
}) {
  const [color, setColor] = useState(initialColor);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  // The original demo avatar predates the reviewed Dashboard portrait. Keep
  // the stored path and upload behavior intact while using that approved crop.
  const demoPortrait = studio && (!initialImagePath || initialImagePath.endsWith("1786258659838-IMG_4813.jpg"));
  const preview = localPreview ?? (demoPortrait ? "/api/dashboard/portrait?image=studio" : initialImageUrl);

  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  const previewBars = useMemo(() => [42, 68, 53, 86, 64, 94, 72], []);

  if (studio) return <section className={studioStyles.appearance} aria-label="Creator profile appearance">
    <input type="hidden" name="dashboard_profile_image_path" value={initialImagePath ?? ""} />
    <input type="hidden" name="dashboard_chart_color" value={color} />
    <div className={studioStyles.profileStrip}>
      <span className={studioStyles.profilePhoto}>{preview ? <img src={preview} alt={`${cloneName} display`} className="creator-avatar" /> : <span className="creator-name">{initials(cloneName)}</span>}</span>
      <div><h2 className="creator-name">{cloneName}</h2><p>Creator profile</p></div>
      <span className={studioStyles.profileBadge}><LockKeyhole size={14} />Identity & appearance</span>
      <label className={studioStyles.photoButton}><Camera size={16} />Change photo<input type="file" name="dashboard_profile_image" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (!file) return; setLocalPreview(current => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(file); }); }} /></label>
    </div>
    <details className={studioStyles.chartAppearance}><summary>Revenue chart colour</summary><div>{COLORS.map(option => <button key={option} type="button" aria-label={`Use chart colour ${option}`} aria-pressed={color === option} style={{ backgroundColor: option }} onClick={() => setColor(option)} />)}<label>Custom<input type="color" aria-label="Choose a custom chart colour" value={color} onChange={event => setColor(event.target.value)} /></label></div></details>
  </section>;

  return (
    <Section
      icon="🎨"
      accent="purple"
      title="Dashboard appearance"
      hint="Controls this creator's display image around the dashboard and her colour in Earnings charts. It does not change her Telegram profile."
    >
      <input type="hidden" name="dashboard_profile_image_path" value={initialImagePath ?? ""} />
      <input type="hidden" name="dashboard_chart_color" value={color} />

      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div>
          <FieldLabel
            label="Display image"
            hint="Shown in the creator switcher, creator cards and Earnings legend. JPG, PNG, WebP or GIF, up to 5 MB."
          />
          <div className="mt-2 flex items-center gap-4">
            <span
              className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white text-lg font-bold shadow-sm"
              style={{ color }}
            >
              {preview ? (
                <img src={preview} alt={`${cloneName} display`} className="h-full w-full object-cover" />
              ) : (
                <span className="creator-name">{initials(cloneName)}</span>
              )}
            </span>
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-line bg-panel px-3 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-accent hover:text-accent">
              Choose image
              <input
                type="file"
                name="dashboard_profile_image"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setLocalPreview((current) => {
                    if (current) URL.revokeObjectURL(current);
                    return URL.createObjectURL(file);
                  });
                }}
              />
            </label>
          </div>
        </div>

        <div>
          <FieldLabel
            label="Revenue chart colour"
            hint="Used for this creator's bars, lines, legend dot and dashboard identity accents."
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {COLORS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={`Use chart colour ${option}`}
                aria-pressed={color === option}
                onClick={() => setColor(option)}
                className="h-8 w-8 rounded-full border-2 transition hover:scale-105"
                style={{
                  backgroundColor: option,
                  borderColor: color === option ? "#06172f" : "white",
                  boxShadow: color === option ? "0 0 0 2px white, 0 0 0 4px #4a8ec4" : "0 0 0 1px #cfdeea",
                }}
              />
            ))}
            <label className="ml-1 flex items-center gap-2 rounded-lg border border-line bg-panel px-2 py-1.5 text-xs font-medium text-muted">
              Custom
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                aria-label="Choose a custom chart colour"
              />
            </label>
          </div>

          <div className="mt-4 rounded-xl border border-line bg-bg p-3">
            <div className="mb-2 flex items-center justify-between text-[11px] text-muted">
              <span>Chart preview</span>
              <span className="creator-name font-semibold" style={{ color }}>{cloneName}</span>
            </div>
            <div className="flex h-12 items-end gap-1.5">
              {previewBars.map((height, index) => (
                <span
                  key={index}
                  className="min-w-0 flex-1 rounded-t-sm"
                  style={{ height: `${height}%`, backgroundColor: color, opacity: 0.72 + index * 0.035 }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

