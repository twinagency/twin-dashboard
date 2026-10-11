import { CREATOR_ACCOUNT_QUESTIONS, CREATOR_PROFILE_SECTIONS } from "@/lib/creator-questionnaire-profile";
import type { CreatorQuestionnairePage } from "@/lib/creator-questionnaire-draft";

// Easy profile questions lead; separate account details finish the questionnaire.
// Versioned slugs also let forms open before this release finish saving safely.
export const COMPACT_QUESTIONNAIRE_PAGES: CreatorQuestionnairePage[] = [
  ...[
    ["quick-v2-introduction", "A quick introduction", "Let’s start with the easy ones."],
    ["quick-v2-personal", "A little more about you", "The details that make it feel like you."],
    ["quick-v2-favourites", "Your favourites", "The things you enjoy talking about."],
    ["quick-v2-preferences", "Your preferences and boundaries", "Tell us what feels right for you."],
  ].map(([slug, title, description], index) => ({ slug, title, description, sections: [CREATOR_PROFILE_SECTIONS[index]] })),
  { slug: "quick-v2-account", title: "Last few details", description: "Your account information stays separate from your creator profile.", sections: [{ title: "Account details", questions: CREATOR_ACCOUNT_QUESTIONS }] },
];

export const COMPACT_QUESTIONNAIRE_ALIASES: Record<string, string> = {
  "quick-about": "quick-v2-account", "personal-contact": "quick-v2-account",
  "quick-identity": "quick-v2-introduction", "identity-basics": "quick-v2-introduction",
  "quick-family": "quick-v2-personal", "family-home": "quick-v2-personal", appearance: "quick-v2-personal", "sizes-health": "quick-v2-personal",
  "quick-personality": "quick-v2-personal", "audience-identity": "quick-v2-personal", "personality-depth": "quick-v2-personal", "background-story": "quick-v2-personal",
  "quick-style": "quick-v2-personal", "quick-replies": "quick-v2-personal", "style-tone-ai": "quick-v2-personal",
  "quick-boundaries": "quick-v2-preferences", "quick-relationships": "quick-v2-preferences", relationships: "quick-v2-preferences", "ai-context": "quick-v2-preferences", "collaboration-boundaries": "quick-v2-preferences",
  "quick-interests": "quick-v2-favourites", "quick-work": "quick-v2-favourites", "goals-replies": "quick-v2-favourites", "work-public-life": "quick-v2-favourites", "favourites-media": "quick-v2-favourites", "favourites-lifestyle": "quick-v2-favourites", "travel-lifestyle": "quick-v2-favourites",
};

// Accepted only by the save endpoint, never rendered as extra questions.
export const PREVIOUS_COMPACT_FIELDS: Record<string, string[]> = {
  "quick-about": ["full_name", "date_of_birth", "email_address", "phone_number"],
  "quick-identity": ["preferred_name", "social_links", "pronouns", "ethnicity", "languages", "from_grew_up", "currently_live", "education_history"],
  "quick-family": ["siblings_family", "kids", "pets", "relationship_status", "height", "visual_appearance", "tattoos_piercings"],
  "quick-personality": ["personal_facts", "introvert_extrovert", "fav_about_self", "fav_about_body"],
  "quick-boundaries": ["private_details", "boundaries"],
  "quick-relationships": ["sexual_orientation", "kinks_fetishes", "turn_ons", "turn_offs", "dom_sub", "love_language"],
  "quick-interests": ["fav_foods", "music_preferences", "fav_destination", "fav_movie_genre", "sports_preferences", "disliked_foods", "party_or_home", "drink_of_choice"],
  "quick-work": ["countries_travelled", "notable_collabs", "other_projects"],
};

export function previousCompactSavePage(slug: string): CreatorQuestionnairePage | undefined {
  if (!Object.prototype.hasOwnProperty.call(PREVIOUS_COMPACT_FIELDS, slug)) return undefined;
  return { slug, title: "Earlier questionnaire", description: "", sections: [{ title: "Earlier questionnaire", questions: PREVIOUS_COMPACT_FIELDS[slug].map(id => ({ id, label: id, type: "textarea" })) }] };
}
