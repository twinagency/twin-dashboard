import type { CreatorQuestion, CreatorQuestionSection } from "@/lib/creator-questionnaire";

// Account information is separate from the 38 creator-profile questions.
export const CREATOR_ACCOUNT_QUESTIONS: CreatorQuestion[] = [
  { id: "full_name", label: "What is your full name?", type: "text", placeholder: "First and last name" },
  { id: "date_of_birth", label: "What is your date of birth?", type: "text", placeholder: "MM / DD / YYYY" },
  { id: "email_address", label: "What is your email address?", type: "text", placeholder: "example@example.com" },
  { id: "phone_number", label: "What is your phone number?", type: "text" },
];

export const CREATOR_PROFILE_SECTIONS: CreatorQuestionSection[] = [
  { title: "About you", questions: [
    { id: "preferred_name", label: "What name do your fans know you by? Include any nickname you regularly use with fans.", type: "text" },
    { id: "social_links", label: "Please share links to your main social media profiles.", type: "textarea" },
    { id: "pronouns", label: "What are your pronouns?", type: "text" },
    { id: "ethnicity", label: "What is your ethnicity or nationality?", type: "text" },
    { id: "languages", label: "Which languages do you speak?", type: "text" },
    { id: "from_grew_up", label: "Where are you from, and where did you grow up?", type: "textarea" },
    { id: "currently_live", label: "Where do you currently live? A city or general area is enough.", type: "text" },
    { id: "education_history", label: "Tell us about your education, previous jobs and background before becoming a creator.", type: "textarea" },
  ] },
  { title: "Family and appearance", questions: [
    { id: "siblings_family", label: "Do you have siblings, and what family information are you comfortable sharing with fans?", type: "textarea" },
    { id: "kids", label: "Do you have children? If yes, is this public knowledge?", type: "text" },
    { id: "pets", label: "Do you have pets? Include their names and any details you are comfortable sharing.", type: "textarea" },
    { id: "relationship_status", label: "What is your relationship status, and is it public knowledge?", type: "text" },
    { id: "height", label: "How tall are you?", type: "text" },
    { id: "visual_appearance", label: "Describe your appearance, including your body type, hair colour, eye colour and noticeable features.", type: "textarea" },
    { id: "tattoos_piercings", label: "Do you have tattoos or piercings? Describe their locations and any tattoo meanings you are comfortable sharing.", type: "textarea" },
  ] },
  { title: "Personality and personal facts", questions: [
    { id: "personal_facts", label: "What interesting facts or hidden talents would you like fans to know about you? List up to five.", type: "textarea" },
    { id: "introvert_extrovert", label: "Do you consider yourself an introvert, extrovert or a mix?", type: "text" },
    { id: "fav_about_self", label: "What is your favourite thing about yourself?", type: "textarea" },
    { id: "fav_about_body", label: "What is your favourite thing about your body?", type: "textarea" },
  ] },
  { title: "Privacy and boundaries", questions: [
    { id: "private_details", label: "Which personal details must your AI keep private? List the specific information, or write “None.”", type: "textarea" },
    { id: "boundaries", label: "Which conversation topics or types of content are outside your permission? List your specific limits, or write “None.”", type: "textarea" },
  ] },
  { title: "Relationships and personal preferences", questions: [
    { id: "sexual_orientation", label: "How do you describe your sexual orientation?", type: "text" },
    { id: "kinks_fetishes", label: "Do you have any kinks or fetishes?", type: "textarea" },
    { id: "turn_ons", label: "What are your turn-ons?", type: "textarea" },
    { id: "turn_offs", label: "What are your turn-offs?", type: "textarea" },
    { id: "dom_sub", label: "Do you consider yourself more dominant, submissive or a mix?", type: "text" },
    { id: "love_language", label: "What is your love language?", type: "text" },
  ] },
  { title: "Interests and favourites", questions: [
    { id: "fav_foods", label: "What are your favourite foods?", type: "text" },
    { id: "music_preferences", label: "What music do you enjoy, and who are your favourite artists?", type: "textarea" },
    { id: "fav_destination", label: "What is your favourite travel destination, and why?", type: "textarea" },
    { id: "fav_movie_genre", label: "What is your favourite movie genre?", type: "text" },
    { id: "sports_preferences", label: "Which sports do you follow, and which teams do you support?", type: "textarea" },
    { id: "disliked_foods", label: "Which foods do you dislike?", type: "text" },
    { id: "party_or_home", label: "Do you prefer going out or staying home?", type: "text" },
    { id: "drink_of_choice", label: "What is your favourite alcoholic drink? If you don’t drink alcohol, say so.", type: "text" },
  ] },
  { title: "Travel and work", questions: [
    { id: "countries_travelled", label: "Which countries or places have you visited?", type: "textarea" },
    { id: "notable_collabs", label: "Which notable collaborations might your fans know about?", type: "textarea" },
    { id: "other_projects", label: "Are you currently working on any other projects, businesses or work outside content creation?", type: "textarea" },
  ] },
];

export const CREATOR_PROFILE_QUESTIONS = CREATOR_PROFILE_SECTIONS.flatMap((section) => section.questions);
export const CREATOR_PROFILE_QUESTIONNAIRE = [...CREATOR_ACCOUNT_QUESTIONS, ...CREATOR_PROFILE_QUESTIONS];

const mergedAnswerSources: Record<string, [string, string][]> = {
  tattoos_piercings: [["tattoos", "Tattoos"], ["piercings", "Piercings"]],
  personal_facts: [["unique_about_you", "Interesting facts"], ["hidden_talents", "Hidden talents"], ["random_facts", "Other facts"]],
  music_preferences: [["fav_music_genre", "Music"], ["fav_artist", "Artists"]],
  sports_preferences: [["sports_watch", "Sports"], ["fav_team", "Teams"]],
};

// Hydrate old drafts without changing stored answers. A saved merged field,
// including an explicit blank, always takes precedence over its legacy fields.
export function creatorProfileAnswers(raw: Record<string, unknown>): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of CREATOR_PROFILE_QUESTIONNAIRE) {
    if (Object.prototype.hasOwnProperty.call(raw, question.id)) {
      answers[question.id] = typeof raw[question.id] === "string" ? raw[question.id] as string : "";
      continue;
    }
    const sources = mergedAnswerSources[question.id];
    if (sources) {
      answers[question.id] = sources.flatMap(([id, label]) => typeof raw[id] === "string" && String(raw[id]).trim() ? [`${label}: ${String(raw[id]).trim()}`] : []).join("\n");
    } else if (question.id === "preferred_name" && typeof raw.stage_name === "string") {
      answers[question.id] = raw.stage_name;
    }
  }
  return answers;
}
