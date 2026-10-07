import { CREATOR_ACCOUNT_QUESTIONS, CREATOR_PROFILE_SECTIONS } from "@/lib/creator-questionnaire-profile";
import type { CreatorQuestionnairePage } from "@/lib/creator-questionnaire-draft";

// Twin/Moxy and the Flirt build share these 38 profile questions. Account
// details have their own page; other portals retain the legacy registry.
const profilePages = [
  ["quick-identity", "About you", "Share the facts your fans know about you."],
  ["quick-family", "Family and appearance", "Add your family, home and appearance details."],
  ["quick-personality", "Personality and personal facts", "Tell us what makes you unique."],
  ["quick-boundaries", "Privacy and boundaries", "Set your privacy and content permissions."],
  ["quick-relationships", "Relationships and personal preferences", "Share your personal preferences."],
  ["quick-interests", "Interests and favourites", "Add your interests and favourites."],
  ["quick-work", "Travel and work", "Tell us about your travel and other work."],
] as const;

export const COMPACT_QUESTIONNAIRE_PAGES: CreatorQuestionnairePage[] = [
  { slug: "quick-about", title: "Account details", description: "Your account information is separate from your creator profile.", sections: [
    { title: "Account details", questions: CREATOR_ACCOUNT_QUESTIONS },
  ] },
  ...profilePages.map(([slug, title, description], index) => ({
    slug, title, description, sections: [CREATOR_PROFILE_SECTIONS[index]],
  })),
];

// Keep bookmarks from the earlier questionnaires useful.
export const COMPACT_QUESTIONNAIRE_ALIASES: Record<string, string> = {
  "personal-contact": "quick-about",
  "background-story": "quick-identity", "identity-basics": "quick-identity",
  "family-home": "quick-family", appearance: "quick-family", "sizes-health": "quick-family",
  "audience-identity": "quick-personality", "style-tone-ai": "quick-personality",
  "ai-context": "quick-boundaries", "personality-depth": "quick-personality",
  "goals-replies": "quick-work", "collaboration-boundaries": "quick-boundaries",
  relationships: "quick-relationships", "work-public-life": "quick-work",
  "favourites-media": "quick-interests", "favourites-lifestyle": "quick-interests", "travel-lifestyle": "quick-work",
  "quick-style": "quick-personality", "quick-replies": "quick-personality",
};

