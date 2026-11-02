import type { CreatorQuestion, CreatorQuestionSection } from "@/lib/creator-questionnaire";

// Account details remain separate from the 22 creator-profile questions.
export const CREATOR_ACCOUNT_QUESTIONS: CreatorQuestion[] = [
  { id: "full_name", label: "What is your full name?", type: "text", placeholder: "First and last name" },
  { id: "date_of_birth", label: "What is your date of birth?", type: "text", placeholder: "MM / DD / YYYY" },
  { id: "email_address", label: "What is your email address?", type: "text", placeholder: "example@example.com" },
  { id: "phone_number", label: "What is your phone number?", type: "text" },
];

export const CREATOR_PROFILE_SECTIONS: CreatorQuestionSection[] = [
  { title: "A quick introduction", questions: [
    { id: "preferred_name", label: "What name do you want your fans to call you?", type: "text" },
    { id: "languages", label: "Which languages do you speak?", type: "text" },
    { id: "ethnicity", label: "What is your ethnicity or nationality?", type: "text" },
    { id: "social_style", label: "What’s your social style?", type: "textarea" },
    { id: "pets", label: "Do you have pets?", type: "textarea" },
    { id: "relationship_status", label: "What is your relationship status, and is it public knowledge?", type: "text" },
  ] },
  { title: "A little more about you", questions: [
    { id: "home_background", label: "Where did you grow up, and where do you live now?", type: "textarea" },
    { id: "family_profile", label: "Do you have siblings or children? What are you comfortable sharing about them?", type: "textarea" },
    { id: "appearance_profile", label: "Describe your appearance: height, body type, hair, eyes, tattoos and piercings.", type: "textarea" },
    { id: "personal_highlights", label: "What three things should fans know about you?", help: "Think personality, hobbies, talents or something unexpected.", type: "textarea" },
    { id: "social_links", label: "Please share links to your main social media profiles.", type: "textarea" },
  ] },
  { title: "Your favourites", questions: [
    { id: "fav_foods", label: "What are your favourite foods?", type: "text" },
    { id: "music_preferences", label: "What music do you enjoy, and who are your favourite artists?", type: "textarea" },
    { id: "fav_movie_genre", label: "What is your favourite movie genre?", type: "text" },
    { id: "sports_preferences", label: "Which sports do you follow, and which teams do you support?", type: "textarea" },
    { id: "travel_favourites", label: "Where have you travelled, and which place is your favourite?", type: "textarea" },
    { id: "drink_of_choice", label: "What is your favourite alcoholic drink?", type: "text" },
  ] },
  { title: "Your preferences and boundaries", questions: [
    { id: "sexual_orientation", label: "How do you describe your sexual orientation?", type: "text" },
    { id: "dom_sub", label: "Do you consider yourself more dominant, submissive or a mix?", type: "text" },
    { id: "turn_ons_including_kinks", label: "What are your turn-ons, including kinks?", type: "textarea" },
    { id: "turn_offs", label: "What are your turn-offs?", type: "textarea" },
    { id: "boundaries", label: "Which conversation topics or types of content are outside your permission?", help: "List your specific limits, or write “None.”", type: "textarea" },
  ] },
];

export const CREATOR_PROFILE_QUESTIONS = CREATOR_PROFILE_SECTIONS.flatMap((section) => section.questions);
export const CREATOR_PROFILE_QUESTIONNAIRE = [...CREATOR_ACCOUNT_QUESTIONS, ...CREATOR_PROFILE_QUESTIONS];

// New IDs distinguish a deliberately edited/cleared combined answer from the
// earlier separate fields. Hydration is read-only; old answers remain stored.
const mergedAnswerSources: Record<string, [string, string][]> = {
  home_background: [["from_grew_up", "Grew up"], ["currently_live", "Lives now"]],
  family_profile: [["siblings_family", "Siblings and family"], ["kids", "Children"]],
  appearance_profile: [["height", "Height"], ["visual_appearance", "Appearance"], ["tattoos_piercings", "Tattoos and piercings"]],
  personal_highlights: [["personal_facts", "Personal facts"], ["fav_about_self", "Favourite qualities"]],
  social_style: [["introvert_extrovert", "Personality"], ["party_or_home", "Social life"]],
  turn_ons_including_kinks: [["turn_ons", "Turn-ons"], ["kinks_fetishes", "Kinks"]],
  travel_favourites: [["countries_travelled", "Places visited"], ["fav_destination", "Favourite place"]],
  tattoos_piercings: [["tattoos", "Tattoos"], ["piercings", "Piercings"]],
  personal_facts: [["unique_about_you", "Interesting facts"], ["hidden_talents", "Hidden talents"], ["random_facts", "Other facts"]],
  music_preferences: [["fav_music_genre", "Music"], ["fav_artist", "Artists"]],
  sports_preferences: [["sports_watch", "Sports"], ["fav_team", "Teams"]],
};

export function creatorProfileAnswers(raw: Record<string, unknown>): Record<string, string> {
  const read = (id: string): string | undefined => {
    if (Object.prototype.hasOwnProperty.call(raw, id)) return typeof raw[id] === "string" ? raw[id] as string : "";
    if (id === "preferred_name" && typeof raw.stage_name === "string") return raw.stage_name;
    const sources = mergedAnswerSources[id];
    if (!sources) return undefined;
    return sources.flatMap(([source, label]) => {
      const value = read(source);
      return value?.trim() ? [`${label}: ${value}`] : [];
    }).join("\n");
  };
  return Object.fromEntries(CREATOR_PROFILE_QUESTIONNAIRE.flatMap(({ id }) => {
    const value = read(id);
    return value === undefined ? [] : [[id, value]];
  }));
}
