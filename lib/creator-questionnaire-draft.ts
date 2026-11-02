import { COMPACT_QUESTIONNAIRE_PAGES, COMPACT_QUESTIONNAIRE_ALIASES } from "@/lib/creator-questionnaire-compact";
import {
  CREATOR_QUESTIONNAIRE,
  CREATOR_QUESTIONNAIRE_SECTIONS,
  type CreatorQuestion,
  type CreatorQuestionSection,
} from "@/lib/creator-questionnaire";

export const CREATOR_QUESTIONNAIRE_REQUIRED_IDS = ["full_name", "preferred_name", "boundaries"] as const;
export const CREATOR_QUESTIONNAIRE_TERMINAL_STATUSES = new Set(["submitted", "reviewing", "approved"]);

export type CreatorQuestionnairePage = {
  slug: string;
  title: string;
  description: string;
  sections: (CreatorQuestionSection & { optionalDetails?: boolean })[];
};

function section(index: number, start = 0, end?: number, title?: string): CreatorQuestionSection {
  const source = CREATOR_QUESTIONNAIRE_SECTIONS[index];
  return {
    title: title || source.title,
    intro: start === 0 ? source.intro : undefined,
    questions: source.questions.slice(start, end),
  };
}

export const CREATOR_QUESTIONNAIRE_PAGES: CreatorQuestionnairePage[] = [
  { slug: "personal-contact", title: "Personal details", description: "Start with your basic information and contact details.", sections: [section(0), section(1)] },
  { slug: "background-story", title: "Background", description: "Share the background details that help your digital twin understand you.", sections: [section(2)] },
  { slug: "audience-identity", title: "What makes you unique", description: "Describe what makes you distinct and memorable to the people who follow you.", sections: [section(4)] },
  { slug: "style-tone-ai", title: "Style, tone and personality", description: "Show us how you communicate and how your AI should feel.", sections: [section(7), section(8), section(9)] },
  { slug: "goals-replies", title: "Real replies", description: "Write examples that teach your digital twin to respond in your natural voice.", sections: [section(11)] },
  { slug: "collaboration-boundaries", title: "Collaborations and boundaries", description: "Define how your AI should handle fans, offers and personal boundaries.", sections: [section(12)] },
  { slug: "ai-context", title: "Additional AI context", description: "Add the phrases, habits and guardrails that make responses feel like you.", sections: [section(13)] },
  { slug: "identity-basics", title: "Identity and background", description: "Add the public identity details fans may ask about.", sections: [section(14, 0, 6, "Identity basics")] },
  { slug: "family-home", title: "Family and home life", description: "Share the home, family and relationship details your AI may need.", sections: [section(14, 6, 12, "Family and home life")] },
  { slug: "appearance", title: "Appearance", description: "Describe your visual appearance and distinguishing details.", sections: [section(15, 0, 5, "Appearance details")] },
  { slug: "sizes-health", title: "Sizes and health", description: "Add sizing and health details fans may ask about.", sections: [section(15, 5, 9, "Sizes and health")] },
  { slug: "work-public-life", title: "Work and public life", description: "Cover collaborations, projects and future career plans.", sections: [section(16)] },
  { slug: "personality-depth", title: "Personality", description: "Add the personal details that make conversations feel genuine.", sections: [section(17)] },
  { slug: "favourites-media", title: "Entertainment and favourites", description: "Share the entertainment, sports and interests you enjoy.", sections: [section(18, 0, 8, "Entertainment and interests")] },
  { slug: "favourites-lifestyle", title: "Lifestyle favourites", description: "Add your favourite colours, food, flowers and social preferences.", sections: [section(18, 8, 14, "Lifestyle favourites")] },
  { slug: "travel-lifestyle", title: "Travel and events", description: "Tell us where you travel and which events matter to you.", sections: [section(19)] },
  { slug: "relationships", title: "Relationship persona", description: "Set the intimate and relationship context your AI is allowed to use.", sections: [section(20)] },
];

export function creatorQuestionnairePage(slug: string | null | undefined, compact = false): CreatorQuestionnairePage {
  const compactSlug = compact && slug ? COMPACT_QUESTIONNAIRE_ALIASES[slug] || slug : slug;
  const shortPage = compact ? COMPACT_QUESTIONNAIRE_PAGES.find((page) => page.slug === compactSlug) : undefined;
  if (shortPage) return shortPage;
  if (compact) return COMPACT_QUESTIONNAIRE_PAGES[0];
  return CREATOR_QUESTIONNAIRE_PAGES.find((page) => page.slug === slug) || CREATOR_QUESTIONNAIRE_PAGES[0];
}

export function creatorQuestionnairePageIndex(slug: string | null | undefined): number {
  const index = CREATOR_QUESTIONNAIRE_PAGES.findIndex((page) => page.slug === slug);
  return index < 0 ? 0 : index;
}

export function creatorQuestionnairePageForQuestion(questionId: string): CreatorQuestionnairePage {
  return CREATOR_QUESTIONNAIRE_PAGES.find((page) => page.sections.some((group) => group.questions.some((question) => question.id === questionId))) || CREATOR_QUESTIONNAIRE_PAGES[0];
}

export function questionnairePageQuestions(page: CreatorQuestionnairePage): CreatorQuestion[] {
  return page.sections.flatMap((group) => group.questions);
}

export function questionnaireRequiredMissing(answers: Record<string, unknown>): string[] {
  return CREATOR_QUESTIONNAIRE_REQUIRED_IDS.filter((id) => typeof answers[id] !== "string" || !String(answers[id]).trim());
}

export function nextQuestionnaireRevision(current?: string | null): string {
  const currentTime = current ? Date.parse(current) : Number.NaN;
  return new Date(Math.max(Date.now(), Number.isFinite(currentTime) ? currentTime + 1 : 0)).toISOString();
}

export function parseQuestionnairePagePatch(page: CreatorQuestionnairePage, raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid questionnaire answers");
  const source = raw as Record<string, unknown>;
  const allowed = new Map(questionnairePageQuestions(page).map((question) => [question.id, question]));
  for (const key of Object.keys(source)) if (!allowed.has(key)) throw new Error("Unsupported questionnaire field");

  const patch: Record<string, string> = {};
  let totalLength = 0;
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string") throw new Error("Questionnaire answers must be text");
    const question = allowed.get(key)!;
    const cleaned = value.trim();
    if (cleaned.length > 5000) throw new Error("One answer is too long");
    if ((question.type === "select" || question.type === "radio") && cleaned && !question.options?.includes(cleaned)) {
      throw new Error("Invalid questionnaire choice");
    }
    totalLength += cleaned.length;
    patch[key] = cleaned;
  }
  if (totalLength > 40000) throw new Error("Questionnaire section is too large");
  return patch;
}

export function questionnaireAnswersFromForm(form: FormData): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of CREATOR_QUESTIONNAIRE) {
    if (!form.has(question.id)) continue;
    const values = form.getAll(question.id).map((value) => String(value || "").trim());
    answers[question.id] = [...values].reverse().find(Boolean) ?? "";
  }
  return answers;
}

