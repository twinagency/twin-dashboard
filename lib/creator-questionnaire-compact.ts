import { CREATOR_QUESTIONNAIRE, type CreatorQuestion } from "@/lib/creator-questionnaire";
import type { CreatorQuestionnairePage } from "@/lib/creator-questionnaire-draft";

// Presentation only: stable answer IDs and choice values preserve existing drafts.
const labels: Record<string, string> = {
  "full_name": "Full name",
  "preferred_name": "Name your fans use",
  "pronouns": "Pronouns",
  "date_of_birth": "Date of birth",
  "email_address": "Email",
  "phone_number": "Phone number",
  "social_links": "Social profile links",
  "education_history": "Your background before becoming a creator",
  "unique_about_you": "What makes you unique?",
  "humour_style": "Your humour",
  "overall_tone": "Your tone",
  "uses_slang": "Do you use slang?",
  "ai_traits": "Your AI personality",
  "reply_today": "“Hey, what are you doing today?”",
  "reply_missed": "“I missed you.”",
  "reply_secret": "“Tell me something most people don’t know about you.”",
  "reply_favorite": "“You’re my favourite creator.”",
  "reply_meet": "“Can we meet one day?”",
  "reply_goodnight": "“Goodnight ❤️”",
  "long_term_goals": "Your long-term goals",
  "flirt_response": "How should your AI handle flirting, attachment or meetup requests?",
  "anything_else": "Anything else we should know?",
  "monetisation": "What do you sell, and at what prices?",
  "boundaries": "Your relationship and sexual boundaries",
  "pet_peeves": "Your pet peeves",
  "controversies": "Public controversies your AI should know about",
  "top_emojis": "Your favourite emojis",
  "catch_phrases": "Words or phrases you often use",
  "topics_avoid_ai": "Topics your AI must avoid",
  "texting_style": "How do you text?",
  "stage_name": "Stage name",
  "star_sign": "Star sign",
  "ethnicity": "Ethnicity or nationality",
  "languages": "Languages you speak",
  "from_grew_up": "Where did you grow up?",
  "currently_live": "Where do you live?",
  "siblings_family": "Family details you’re happy to share",
  "kids": "Children, and whether fans know",
  "pets": "Pets and their names",
  "relationship_status": "Relationship status, and whether it’s public",
  "height": "Height",
  "visual_appearance": "Appearance and standout features",
  "tattoos": "Tattoos and their meaning",
  "piercings": "Piercings",
  "cosmetic_work": "Cosmetic work you’re happy for fans to know about",
  "wardrobe_sizes": "Clothing and bikini sizes",
  "bra_size": "Bra size",
  "shoe_size": "Shoe size",
  "injuries": "Past injuries you’re happy to share",
  "future_goals": "Career goals",
  "notable_collabs": "Notable collaborations",
  "other_projects": "Other work, businesses or projects",
  "introvert_extrovert": "Introvert, extrovert or a mix?",
  "fav_about_self": "Your favourite thing about yourself",
  "fav_about_body": "Your favourite thing about your body",
  "hidden_talents": "Hidden talents",
  "random_facts": "Fun facts about you",
  "fav_movie_genre": "Favourite movie genre",
  "fav_tv_movie": "Favourite show or movie",
  "fav_music_genre": "Favourite music genre",
  "fav_artist": "Favourite artist",
  "games": "Favourite games",
  "reading": "Favourite books",
  "sports_watch": "Sports you follow",
  "fav_team": "Favourite team",
  "fav_colour": "Favourite colour",
  "fav_flower": "Favourite flower",
  "fav_foods": "Favourite foods",
  "disliked_foods": "Foods you dislike",
  "party_or_home": "Going out or staying in?",
  "drink_of_choice": "Favourite drink",
  "travel_places_fans": "Trips your fans know about",
  "countries_travelled": "Countries you’ve visited",
  "fav_destination": "Favourite travel destination",
  "events": "Events you attend or plan to attend",
  "sexual_orientation": "Sexual orientation",
  "kinks_fetishes": "Kinks you’re comfortable sharing",
  "turn_ons": "Turn-ons",
  "turn_offs": "Turn-offs",
  "dom_sub": "Dominant, submissive or a mix?",
  "love_language": "Love language",
  "roleplay": "Roleplay preferences",
  "relationship_wants": "What do you look for in a relationship?"
};
const byId = new Map(CREATOR_QUESTIONNAIRE.map((question) => [question.id, question]));
function group(title: string, ids: string[], optionalDetails = false) {
  return { title, optionalDetails, questions: ids.map((id): CreatorQuestion => {
    const question = byId.get(id);
    if (!question) throw new Error(`Unknown onboarding question: ${id}`);
    return { ...question, label: labels[id] || question.label,
      placeholder: id === "texting_style" ? "Short replies, lowercase, emojis…" : id === "boundaries" ? "What should your AI never say, promise or suggest?" : question.placeholder };
  }) };
}

export const COMPACT_QUESTIONNAIRE_PAGES: CreatorQuestionnairePage[] = [
  { slug: "quick-about", title: "About you", description: "Start with your name and socials.", sections: [
    group("The basics", ["full_name", "preferred_name", "date_of_birth", "email_address", "social_links"]),
    group("More about you", ["pronouns", "phone_number", "stage_name", "star_sign", "ethnicity", "languages", "from_grew_up", "currently_live", "education_history"], true),
    group("Family and home", ["siblings_family", "kids", "pets", "relationship_status"], true),
    group("Appearance", ["height", "visual_appearance", "tattoos", "piercings", "cosmetic_work", "wardrobe_sizes", "bra_size", "shoe_size", "injuries"], true),
  ] },
  { slug: "quick-style", title: "Your style", description: "Help your AI sound like you.", sections: [
    group("How you chat", ["humour_style", "overall_tone", "uses_slang", "ai_traits", "texting_style", "top_emojis", "catch_phrases"]),
    group("More personality", ["unique_about_you", "pet_peeves", "introvert_extrovert", "fav_about_self", "fav_about_body", "hidden_talents", "random_facts"], true),
  ] },
  { slug: "quick-replies", title: "Example replies", description: "Reply to these messages as you normally would. Short answers are fine.", sections: [
    group("In your own words", ["reply_today", "reply_missed", "reply_secret", "reply_favorite", "reply_meet", "reply_goodnight"]),
  ] },
  { slug: "quick-boundaries", title: "Your boundaries", description: "Set what your AI can say and offer.", sections: [
    group("Your rules", ["boundaries", "topics_avoid_ai", "flirt_response", "monetisation"]),
    group("Relationship preferences", ["sexual_orientation", "kinks_fetishes", "turn_ons", "turn_offs", "dom_sub", "love_language", "roleplay", "relationship_wants"], true),
    group("Anything else", ["controversies", "anything_else"], true),
  ] },
  { slug: "quick-interests", title: "Your interests", description: "A few favourites make conversations more personal.", sections: [
    group("Your favourites", ["fav_foods", "fav_music_genre", "fav_artist", "fav_tv_movie", "fav_destination"]),
    group("More favourites", ["fav_movie_genre", "games", "reading", "sports_watch", "fav_team", "fav_colour", "fav_flower", "disliked_foods", "party_or_home", "drink_of_choice"], true),
    group("Travel and plans", ["travel_places_fans", "countries_travelled", "events", "long_term_goals", "future_goals", "notable_collabs", "other_projects"], true),
  ] },
];

// Existing bookmarks and missing-answer redirects still land in the right group.
export const COMPACT_QUESTIONNAIRE_ALIASES: Record<string, string> = {
  "personal-contact": "quick-about", "background-story": "quick-about", "identity-basics": "quick-about", "family-home": "quick-about", appearance: "quick-about", "sizes-health": "quick-about",
  "audience-identity": "quick-style", "style-tone-ai": "quick-style", "ai-context": "quick-style", "personality-depth": "quick-style",
  "goals-replies": "quick-replies", "collaboration-boundaries": "quick-boundaries", relationships: "quick-boundaries",
  "work-public-life": "quick-interests", "favourites-media": "quick-interests", "favourites-lifestyle": "quick-interests", "travel-lifestyle": "quick-interests",
};
