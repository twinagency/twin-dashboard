"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Cloud, CloudOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CREATOR_QUESTIONNAIRE_PAGES,
  CREATOR_QUESTIONNAIRE_REQUIRED_IDS,
  questionnairePageQuestions,
  type CreatorQuestionnairePage,
} from "@/lib/creator-questionnaire-draft";
import { COMPACT_QUESTIONNAIRE_PAGES } from "@/lib/creator-questionnaire-compact";
import type { CreatorQuestion } from "@/lib/creator-questionnaire";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict" | "locked";

function textAreaClass() {
  return "min-h-28 w-full rounded-lg border border-[#7b8798] bg-transparent px-3 py-2 text-base text-ink outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
}

function selectClass() {
  return "h-11 w-full rounded-md border border-[#7b8798] bg-transparent px-3 text-base text-ink outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
}

function QuestionField({ question, value, locked, optional = false, compact = false }: { question: CreatorQuestion; value: string; locked: boolean; optional?: boolean; compact?: boolean }) {
  const required = !optional && CREATOR_QUESTIONNAIRE_REQUIRED_IDS.includes(question.id as (typeof CREATOR_QUESTIONNAIRE_REQUIRED_IDS)[number]);
  const label = <span className="mb-1.5 block text-sm font-medium text-ink">{question.label}{required ? " *" : ""}</span>;
  const help = compact ? null : question.help ? <span className="mt-1.5 block text-sm leading-relaxed text-muted">{question.help}</span> : null;

  if (question.type === "textarea") {
    return <label className="block">{label}<textarea name={question.id} rows={compact ? 2 : undefined} className={compact ? textAreaClass().replace("min-h-28", "min-h-20") : textAreaClass()} placeholder={question.placeholder} defaultValue={value} required={required} disabled={locked} />{help}</label>;
  }
  if (question.type === "select") {
    return <label className="block">{label}<select name={question.id} className={selectClass()} defaultValue={value} required={required} disabled={locked}><option value="">Select...</option>{(question.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select>{help}</label>;
  }
  if (question.type === "radio") {
    return <fieldset className="block" disabled={locked}><legend className="mb-2 text-sm font-medium text-ink">{question.label}{required ? " *" : ""}</legend><div className="flex flex-wrap gap-3">{(question.options || []).map((option) => <label key={option} className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm text-ink"><input type="radio" name={question.id} value={option} defaultChecked={value === option} required={required} />{option}</label>)}</div>{help}</fieldset>;
  }
  return <label className="block">{label}<Input name={question.id} defaultValue={value} placeholder={question.placeholder} required={required} disabled={locked} className="h-11 border-[#7b8798] text-base" />{help}</label>;
}

function saveLabel(state: SaveState) {
  if (state === "saving") return { icon: LoaderCircle, text: "Saving...", className: "text-accent" };
  if (state === "saved") return { icon: Check, text: "Saved", className: "text-emerald-700" };
  if (state === "error") return { icon: CloudOff, text: "Not saved. Try again.", className: "text-rose-700" };
  if (state === "conflict") return { icon: CloudOff, text: "Changed elsewhere. Refresh this page.", className: "text-rose-700" };
  if (state === "locked") return { icon: Check, text: "Questionnaire locked", className: "text-muted" };
  if (state === "dirty") return { icon: Cloud, text: "Waiting to save", className: "text-muted" };
  return { icon: Cloud, text: "Changes save automatically", className: "text-muted" };
}

export default function CreatorQuestionnaireWizard({
  page,
  initialAnswers,
  initialRevision,
  locked = false,
  optional = false,
}: {
  page: CreatorQuestionnairePage;
  initialAnswers: Record<string, string>;
  initialRevision: string;
  locked?: boolean;
  /** Every question optional (Moxy creators, Ronan 2026-10-03). */
  optional?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const revisionRef = useRef(initialRevision);
  const dirtyRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>(locked ? "locked" : "idle");
  const [navigating, setNavigating] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const [answered, setAnswered] = useState(() => Object.values(initialAnswers).filter((value) => value.trim()).length);
  const compact = page.slug.startsWith("quick-");
  const pages = compact ? COMPACT_QUESTIONNAIRE_PAGES : CREATOR_QUESTIONNAIRE_PAGES;
  const currentIndex = Math.max(0, pages.findIndex((item) => item.slug === page.slug));
  const questions = useMemo(() => questionnairePageQuestions(page), [page]);

  const snapshot = useCallback(() => {
    const form = formRef.current;
    if (!form) return {} as Record<string, string>;
    const data = new FormData(form);
    return Object.fromEntries(questions.map((question) => [question.id, String(data.get(question.id) || "")])) as Record<string, string>;
  }, [questions]);

  const flushDraft = useCallback(async (): Promise<boolean> => {
    if (locked) return true;
    if (savePromiseRef.current) {
      const priorSaved = await savePromiseRef.current;
      if (!priorSaved) return false;
      if (dirtyRef.current) return flushDraft();
      return priorSaved;
    }
    if (!dirtyRef.current) return saveState !== "error" && saveState !== "conflict";

    dirtyRef.current = false;
    const answers = snapshot();
    setSaveState("saving");
    const request = (async () => {
      try {
        const response = await fetch("/creator-auth/onboarding/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ section: page.slug, answers, revision: revisionRef.current }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 409) {
          setSaveState("conflict");
          dirtyRef.current = true;
          return false;
        }
        if (!response.ok || !result?.revision) {
          dirtyRef.current = true;
          setSaveState("error");
          return false;
        }
        revisionRef.current = result.revision;
        setSaveState(dirtyRef.current ? "dirty" : "saved");
        return true;
      } catch {
        dirtyRef.current = true;
        setSaveState("error");
        return false;
      } finally {
        savePromiseRef.current = null;
      }
    })();
    savePromiseRef.current = request;
    return request;
  }, [locked, page.slug, saveState, snapshot]);

  const markDirty = () => {
    if (locked) return;
    dirtyRef.current = true;
    setSaveState("dirty");
    setAnswered(Object.values(snapshot()).filter((value) => value.trim()).length);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void flushDraft(); }, 1000);
  };

  const goTo = async (target: number | "finish" | "hub" | "dashboard" | "content") => {
    if (navigating) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (!locked && (target === "finish" || (typeof target === "number" && target > currentIndex)) && !formRef.current?.reportValidity()) return;
    setNavigating(true);
    setNavigationError("");
    try {
      let saved = await flushDraft();
      while (saved && dirtyRef.current) saved = await flushDraft();
      if (!saved) return;
      if (target === "hub" || target === "dashboard" || target === "content") {
        window.location.assign(target === "dashboard" ? "/creator" : target === "content" ? "/creator/onboarding?step=content" : "/creator/onboarding");
        return;
      }
      if (target === "finish") {
        const response = await fetch("/creator-auth/onboarding", {
          method: "POST",
          body: new URLSearchParams({ action: "questionnaire", revision: revisionRef.current }),
        });
        const destination = new URL(response.url, window.location.origin);
        if (!response.ok || destination.origin !== window.location.origin || destination.pathname !== "/creator/onboarding" || destination.searchParams.get("status") !== "questionnaire_saved") {
          setNavigationError("The questionnaire could not be finished. Your saved answers are still here. Please try again.");
          return;
        }
        window.location.assign(optional ? "/creator/onboarding?step=content" : destination.href);
        return;
      }
      const next = pages[target];
      window.location.assign(`/creator/onboarding?step=questionnaire&section=${encodeURIComponent(next.slug)}`);
    } catch {
      setNavigationError("The save could not be confirmed. Please try again before leaving this page.");
    } finally {
      // Failed finish/save requests must never leave all navigation disabled.
      setNavigating(false);
    }
  };

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const saved = saveLabel(saveState);
  const SaveIcon = saved.icon;
  const progress = Math.round(((currentIndex + 1) / CREATOR_QUESTIONNAIRE_PAGES.length) * 100);

  if (compact) return (
    <form ref={formRef} onSubmit={(event) => event.preventDefault()} onInput={markDirty} className="grid gap-4" data-questionnaire-page={page.slug} data-onboarding-optional={optional ? "true" : "false"}>
      <div id="questionnaire-top" className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-accent">Section {currentIndex + 1} of {pages.length}</span>
          <span role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 ${saved.className}`}><SaveIcon className={`size-3.5 shrink-0 ${saveState === "saving" ? "animate-spin" : ""}`} aria-hidden="true" />{saveState === "idle" ? "Autosave on" : saved.text}</span>
        </div>
        <div className="flex gap-1.5" role="progressbar" aria-label="Questionnaire section" aria-valuemin={1} aria-valuemax={pages.length} aria-valuenow={currentIndex + 1}>
          {pages.map((item, index) => <span key={item.slug} className={`h-1.5 flex-1 rounded-full ${index <= currentIndex ? "bg-accent" : "bg-border"}`} />)}
        </div>
        <div><h2 className="font-heading text-2xl font-semibold text-ink">{page.title}</h2><p className="mt-1 text-sm text-muted">{page.description}</p></div>
        <p className="text-xs text-muted">{optional ? "All answers are optional. Add what you can." : "Fields marked * are required."}</p>
      </div>
      {page.sections.map((group) => {
        const fields = <div className="grid gap-4 sm:grid-cols-2">{group.questions.map((question) => <div key={question.id} className={question.type === "textarea" || question.type === "radio" ? "sm:col-span-2" : ""}><QuestionField question={question} value={initialAnswers[question.id] || ""} locked={locked} optional={optional} compact /></div>)}</div>;
        return group.optionalDetails ? <details key={group.title} className="group rounded-xl border border-border bg-white px-4" data-optional-details>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-medium text-ink"><span>{group.title} <span className="font-normal text-muted">(optional)</span></span><ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
          <div className="pb-4 pt-1">{fields}</div>
        </details> : <section key={group.title} aria-label={group.title} className="py-1">{fields}</section>;
      })}
      {navigationError && <p role="alert" className="text-sm text-rose-700">{navigationError}</p>}
      {(saveState === "error" || saveState === "conflict") && <p role="alert" className="text-sm text-rose-700">{saveState === "conflict" ? "Your answers changed in another window. Refresh before continuing." : "Your latest changes have not saved. Try Continue again."}</p>}
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
        <button type="button" disabled={navigating || saveState === "saving"} onClick={() => void goTo("dashboard")} className="min-h-11 text-muted underline underline-offset-4 disabled:opacity-50">{locked ? "Dashboard" : "Save and finish later"}</button>
        {optional && !locked && <button type="button" disabled={navigating || saveState === "saving"} onClick={() => void goTo("content")} className="min-h-11 text-muted underline underline-offset-4 disabled:opacity-50">Skip questions</button>}
      </div>
      <div className="sticky bottom-0 z-10 -mx-1 grid grid-cols-[auto_1fr] gap-3 border-t border-border bg-white/95 px-1 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur" data-questionnaire-navigation>
        <Button type="button" variant="outline" disabled={navigating || saveState === "saving"} onClick={() => void goTo(currentIndex > 0 ? currentIndex - 1 : "hub")} className="min-h-11 px-4"><ArrowLeft className="size-4" aria-hidden="true" /> Back</Button>
        <Button type="button" disabled={navigating || saveState === "saving"} onClick={() => void goTo(currentIndex < pages.length - 1 ? currentIndex + 1 : locked ? "content" : "finish")} className="min-h-11">{navigating ? "Saving…" : currentIndex < pages.length - 1 ? "Continue" : "Continue to content"}<ArrowRight className="size-4" aria-hidden="true" /></Button>
      </div>
    </form>
  );

  return (
    <form ref={formRef} onSubmit={(event) => event.preventDefault()} onInput={markDirty} className="grid gap-6" data-questionnaire-page={page.slug}>
      <div id="questionnaire-top" className="rounded-2xl border border-border bg-muted/10 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">Part {currentIndex + 1} of {CREATOR_QUESTIONNAIRE_PAGES.length}</p>
            <h3 className="mt-1 font-heading text-2xl font-semibold text-ink">{page.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{page.description}</p>
          </div>
          <div role="status" aria-live="polite" className={`inline-flex items-center gap-2 text-sm font-semibold ${saved.className}`}>
            <SaveIcon className={`size-4 ${saveState === "saving" ? "animate-spin" : ""}`} aria-hidden="true" /> {saved.text}
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Questionnaire progress" aria-valuemin={1} aria-valuemax={CREATOR_QUESTIONNAIRE_PAGES.length} aria-valuenow={currentIndex + 1}>
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">{answered} of {questions.length} questions answered in this part</p>
      </div>

      {page.sections.map((group, sectionIndex) => (
        <section key={`${group.title}-${sectionIndex}`} className="rounded-2xl border border-border bg-white p-5 sm:p-6">
          <h3 className="text-lg font-semibold text-ink">{group.title}</h3>
          {group.intro && <p className="mt-2 text-sm leading-relaxed text-muted">{group.intro}</p>}
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {group.questions.map((question) => (
              <div key={question.id} className={question.type === "textarea" || question.type === "radio" ? "md:col-span-2" : ""}>
                <QuestionField question={question} value={initialAnswers[question.id] || ""} locked={locked} optional={optional} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {navigationError && <p role="alert" className="text-sm text-rose-700">{navigationError}</p>}
      <div className="sticky bottom-4 z-10 rounded-2xl border border-border bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" size="lg" disabled={navigating || saveState === "saving"} onClick={() => void goTo("hub")} className="min-h-11 w-full sm:w-auto">
            <ArrowLeft className="size-4" aria-hidden="true" /> {locked ? "Return to onboarding" : "Save and return to onboarding"}
          </Button>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            {optional && <Button type="button" variant="outline" size="lg" disabled={navigating || saveState === "saving"} onClick={() => void goTo("dashboard")} className="min-h-11 w-full sm:w-auto">{locked ? "Dashboard" : "Save and go to dashboard"}</Button>}
            {optional && !locked && <Button type="button" variant="outline" size="lg" disabled={navigating || saveState === "saving"} onClick={() => void goTo("content")} className="min-h-11 w-full sm:w-auto">Skip questionnaire</Button>}
            {currentIndex > 0 && <Button type="button" variant="outline" size="lg" disabled={navigating || saveState === "saving"} onClick={() => void goTo(currentIndex - 1)} className="min-h-11 w-full sm:w-auto">
              <ArrowLeft className="size-4" aria-hidden="true" /> {locked ? "Previous part" : "Save and go back"}
            </Button>}
            {currentIndex < CREATOR_QUESTIONNAIRE_PAGES.length - 1 ? (
              <Button type="button" size="lg" disabled={navigating || saveState === "saving"} onClick={() => void goTo(currentIndex + 1)} className="min-h-11 w-full sm:w-auto">
                {locked ? "Next part" : "Save and continue"} <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            ) : !locked ? (
              <Button type="button" size="lg" disabled={navigating || saveState === "saving"} onClick={() => void goTo("finish")} className="min-h-11 w-full sm:w-auto">
                {optional ? "Continue to content" : "Finish questionnaire"} <Check className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  );
}
