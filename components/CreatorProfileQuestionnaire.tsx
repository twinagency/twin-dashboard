"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, LoaderCircle, X } from "lucide-react";
import { COMPACT_QUESTIONNAIRE_PAGES } from "@/lib/creator-questionnaire-compact";
import { CREATOR_PROFILE_SECTIONS, CREATOR_PROFILE_QUESTIONNAIRE } from "@/lib/creator-questionnaire-profile";
import { CREATOR_QUESTIONNAIRE_REQUIRED_IDS, questionnairePageQuestions, type CreatorQuestionnairePage } from "@/lib/creator-questionnaire-draft";
import CreatorProfileField from "./CreatorProfileFields";
import styles from "./CreatorProfileQuestionnaire.module.css";

export type CreatorProfileQuestionnaireProps = {
  page: CreatorQuestionnairePage;
  initialAnswers: Record<string, string>;
  initialRevision: string;
  locked?: boolean;
  optional?: boolean;
};
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";
type Destination = number | "content" | "dashboard" | "hub" | "finish";

const pages = COMPACT_QUESTIONNAIRE_PAGES;
const previewLabels: Record<string, string> = {
  languages: "Languages", ethnicity: "Ethnicity or nationality", social_style: "Social style", pets: "Pets", relationship_status: "Relationship",
  home_background: "Home", family_profile: "Family", appearance_profile: "Appearance", personal_highlights: "Personal facts", social_links: "Social profiles",
  fav_foods: "Food", music_preferences: "Music", fav_movie_genre: "Movies", sports_preferences: "Sports", travel_favourites: "Travel", drink_of_choice: "Drinks",
  sexual_orientation: "Orientation", dom_sub: "Preferences", turn_ons_including_kinks: "Turn-ons, including kinks", turn_offs: "Turn-offs", boundaries: "Boundaries",
};

export default function CreatorProfileQuestionnaire({ page: initialPage, initialAnswers, initialRevision, locked = false, optional = false }: CreatorProfileQuestionnaireProps) {
  const [currentIndex, setCurrentIndex] = useState(() => Math.max(0, pages.findIndex(item => item.slug === initialPage.slug)));
  const [answers, setAnswers] = useState(initialAnswers);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [navigating, setNavigating] = useState(false);
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [milestone, setMilestone] = useState("");
  const [reviewed, setReviewed] = useState<string[]>([]);
  const answersRef = useRef(initialAnswers);
  const revisionRef = useRef(initialRevision);
  const dirtyPages = useRef(new Set<string>());
  const dirtyFields = useRef(new Map<string, Set<string>>());
  const savePromise = useRef<Promise<boolean> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationRef = useRef(false);
  const conflictRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const page = pages[currentIndex];
  const questions = questionnairePageQuestions(page);
  const completed = CREATOR_PROFILE_QUESTIONNAIRE.filter(question => answers[question.id]?.trim() || reviewed.includes(question.id)).length;
  const progress = Math.round(completed / CREATOR_PROFILE_QUESTIONNAIRE.length * 100);

  // Serialize saves across pages. A click on Continue joins an in-flight save;
  // edits made during that request are saved in a second revision-checked pass.
  const flush = useCallback((): Promise<boolean> => {
    if (locked) return Promise.resolve(true);
    if (conflictRef.current) return Promise.resolve(false);
    if (savePromise.current) return savePromise.current;
    if (!dirtyPages.current.size) return Promise.resolve(true);
    const request = (async () => {
      while (dirtyPages.current.size) {
        const slug = dirtyPages.current.values().next().value as string;
        const changed = dirtyFields.current.get(slug) || new Set<string>();
        const patch = Object.fromEntries([...changed].map(id => [id, answersRef.current[id] || ""]));
        dirtyPages.current.delete(slug);
        dirtyFields.current.delete(slug);
        setSaveState("saving");
        try {
          const response = await fetch("/creator-auth/onboarding/draft", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ section: slug, answers: patch, revision: revisionRef.current }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || typeof result?.revision !== "string" || !result.revision) {
            dirtyPages.current.add(slug);
            dirtyFields.current.set(slug, new Set([...changed, ...dirtyFields.current.get(slug) || []]));
            conflictRef.current = response.status === 409;
            setSaveState(conflictRef.current ? "conflict" : "error");
            setError(conflictRef.current ? "Your answers changed in another window. Copy any unsaved edits, then refresh before continuing." : "Your latest changes have not saved. Try again below.");
            return false;
          }
          revisionRef.current = result.revision;
        } catch {
          dirtyPages.current.add(slug);
          dirtyFields.current.set(slug, new Set([...changed, ...dirtyFields.current.get(slug) || []]));
          setSaveState("error");
          setError("Your latest changes have not saved. Check your connection and try again.");
          return false;
        }
      }
      setSaveState("saved");
      setError("");
      return true;
    })();
    savePromise.current = request;
    void request.finally(() => { savePromise.current = null; });
    return request;
  }, [locked]);

  const change = (id: string, value: string) => {
    if (locked || navigationRef.current || conflictRef.current) return;
    const next = { ...answersRef.current, [id]: value };
    answersRef.current = next;
    setAnswers(next);
    dirtyPages.current.add(page.slug);
    dirtyFields.current.set(page.slug, new Set([...dirtyFields.current.get(page.slug) || [], id]));
    setSaveState("dirty");
    setMilestone("");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flush(); }, 1000);
  };

  const goTo = async (target: Destination) => {
    if (navigationRef.current) return;
    if (!locked && (target === "finish" || typeof target === "number" && target > currentIndex) && !formRef.current?.reportValidity()) return;
    navigationRef.current = true;
    setNavigating(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      if (!await flush()) return;
      if (typeof target === "number") {
        if (target > currentIndex) setReviewed(previous => [...new Set([...previous, ...questions.map(({ id }) => id)])]);
        setMilestone(target === 1 && questions.some(({ id }) => answersRef.current[id]?.trim()) ? "Introduction saved" : "");
        setCurrentIndex(target);
        const url = new URL(window.location.href);
        url.searchParams.set("step", "questionnaire");
        url.searchParams.set("section", pages[target].slug);
        url.searchParams.delete("status");
        url.hash = "";
        // Replace only the section URL: Back/Continue stay in the same component,
        // preserving all answers and the confirmed revision without a reload.
        window.history.replaceState(window.history.state, "", url);
        requestAnimationFrame(() => {
          headingRef.current?.focus({ preventScroll: true });
          headingRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
        });
        return;
      }
      if (target === "finish" && !locked) {
        const response = await fetch("/creator-auth/onboarding", { method: "POST", body: new URLSearchParams({ action: "questionnaire", revision: revisionRef.current }) });
        const destination = new URL(response.url, window.location.origin);
        if (!response.ok || destination.origin !== window.location.origin || destination.pathname !== "/creator/onboarding" || destination.searchParams.get("status") !== "questionnaire_saved") {
          setError("The questionnaire could not be finished. Your saved answers are still here. Please try again.");
          return;
        }
      }
      window.location.assign(target === "dashboard" ? "/creator" : target === "hub" ? "/creator/onboarding" : "/creator/onboarding?step=content");
    } catch {
      setError("We could not finish that step. Your answers are still here. Please try again.");
    } finally {
      navigationRef.current = false;
      setNavigating(false);
    }
  };

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyPages.current.size && !savePromise.current) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.removeEventListener("beforeunload", beforeUnload); if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  useEffect(() => {
    const navigate = (event: Event) => {
      const href = (event as CustomEvent<{ href: string }>).detail?.href;
      const target = href === "/creator" ? "dashboard" : href === "/creator/onboarding?step=content" ? "content" : null;
      if (target) { event.preventDefault(); void goTo(target); }
    };
    window.addEventListener("creator-setup:navigate", navigate);
    return () => window.removeEventListener("creator-setup:navigate", navigate);
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (previewOpen && dialog && !dialog.open) dialog.showModal();
    else if (!previewOpen && dialog?.open) dialog.close();
    if (!previewOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [previewOpen]);

  const closePreview = () => { setPreviewOpen(false); previewButtonRef.current?.focus(); };
  const name = answers.preferred_name?.trim();
  const hasProfile = CREATOR_PROFILE_SECTIONS.some(section => section.questions.some(question => answers[question.id]?.trim()));
  const saveCopy = locked ? "Saved answers" : saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Waiting to save" : saveState === "error" || saveState === "conflict" ? "Not saved" : "Autosave on";

  return <div className={styles.root} data-profile-flow>
    <form ref={formRef} onSubmit={event => event.preventDefault()} data-questionnaire-page={page.slug} data-onboarding-optional={optional ? "true" : "false"}>
      <div className={styles.topLine}>
        <span className={styles.milestone} role="status">{milestone && <><Check size={14} aria-hidden="true" />{milestone}</>}</span>
        <span className={styles.saveStatus} data-save-state={saveState} role="status" aria-live="polite">{saveState === "saving" ? <LoaderCircle size={14} className={styles.spinner} aria-hidden="true" /> : saveState === "saved" || locked ? <Check size={14} aria-hidden="true" /> : null}{saveCopy}</span>
      </div>
      <div className={styles.progress} role="progressbar" aria-label="Questionnaire progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${progress}% answered or reviewed`}><span style={{ width: `${progress}%` }} /></div>
      <div className={styles.page} key={page.slug}>
        <header className={styles.pageHeading}><h2 ref={headingRef} tabIndex={-1}>{page.title}</h2><p>{page.description}</p></header>
        <div className={styles.fields}>{questions.map(question => <CreatorProfileField key={question.id} question={question} value={answers[question.id] || ""} onChange={value => change(question.id, value)} disabled={locked || navigating || conflictRef.current} required={!optional && CREATOR_QUESTIONNAIRE_REQUIRED_IDS.includes(question.id as (typeof CREATOR_QUESTIONNAIRE_REQUIRED_IDS)[number])} />)}</div>
      </div>
      {error && <div role="alert" className={styles.error}><p>{error}</p>{saveState === "error" && <button type="button" disabled={navigating} onClick={() => void flush()}>Try saving again</button>}</div>}
      <div className={styles.footer} data-questionnaire-navigation>
        <div className={styles.footerLinks}><button type="button" ref={previewButtonRef} onClick={() => setPreviewOpen(true)}><Eye size={16} aria-hidden="true" />Preview profile</button>
          {optional && !locked && <button type="button" disabled={navigating} onClick={() => void goTo("content")}>Skip questions</button>}
        </div>
        <div className={styles.navigation}>
          <button type="button" className={styles.back} disabled={navigating} onClick={() => void goTo(currentIndex > 0 ? currentIndex - 1 : "dashboard")}><ArrowLeft size={17} aria-hidden="true" />Back</button>
          <button type="button" className={styles.continue} disabled={navigating || conflictRef.current} onClick={() => void goTo(currentIndex < pages.length - 1 ? currentIndex + 1 : locked ? "content" : "finish")}>{navigating ? "Saving…" : currentIndex < pages.length - 1 ? "Continue" : "Continue to content"}{navigating ? <LoaderCircle size={17} className={styles.spinner} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}</button>
        </div>
      </div>
    </form>
    <dialog ref={dialogRef} className={styles.preview} aria-labelledby="profile-preview-title" onCancel={event => { event.preventDefault(); closePreview(); }} onClick={event => { if (event.target === event.currentTarget) closePreview(); }}>
      <div className={styles.previewInner}>
        <div className={styles.previewTop}><span>PROFILE PREVIEW</span><button type="button" aria-label="Close profile preview" onClick={closePreview}><X size={21} /></button></div>
        <div className={styles.previewHeading}><div className={styles.monogram} aria-hidden="true">{name ? Array.from(name)[0].toUpperCase() : "•"}</div><div><h2 id="profile-preview-title">{name ? `Meet ${name}` : "Your profile"}</h2><p>Your answers, brought together.</p></div></div>
        {!hasProfile && <p className={styles.emptyPreview}>Your profile will take shape here as you answer.</p>}
        {CREATOR_PROFILE_SECTIONS.map(section => {
          const shown = section.questions.filter(question => question.id !== "preferred_name" && answers[question.id]?.trim());
          return shown.length ? <section key={section.title} className={styles.previewSection}><h3>{section.title}</h3><dl>{shown.map(question => <div key={question.id}><dt>{previewLabels[question.id]}</dt><dd>{answers[question.id]}</dd></div>)}</dl></section> : null;
        })}
        <p className={styles.previewNote}>Updates as you answer.</p>
        <button type="button" className={styles.continue} onClick={closePreview}>Back to questions</button>
      </div>
    </dialog>
  </div>;
}
