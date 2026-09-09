export type CreatorQuestionType = "text" | "textarea" | "select" | "radio";
export type CreatorQuestion = {
  id: string;
  label: string;
  help?: string;
  type: CreatorQuestionType;
  placeholder?: string;
  options?: string[];
};
export type CreatorQuestionSection = { title: string; intro?: string; questions: CreatorQuestion[] };

// Exact questionnaire copied from the current Lovable Twin onboarding source.
export const CREATOR_QUESTIONNAIRE_SECTIONS: CreatorQuestionSection[] = [
  { title: "Section 1: Personal Information", questions: [
    { id: "full_name", label: "What is your full name?", type: "text", placeholder: "First and last name" },
    { id: "preferred_name", label: "What is your preferred name or nickname?", type: "text" },
    { id: "pronouns", label: "What are your pronouns?", type: "text" },
    { id: "date_of_birth", label: "What is your date of birth?", type: "text", placeholder: "MM / DD / YYYY" },
    { id: "appearance_physical", label: "Describe your appearance and any physical details fans often ask about.", help: "Please describe scars, birthmarks, fitness details, and other notable physical characteristics fans often ask about.", type: "textarea" },
  ]},
  { title: "Section 2: Contact & Socials", questions: [
    { id: "email_address", label: "What is your email address?", type: "text", placeholder: "example@example.com" },
    { id: "phone_number", label: "What is your phone number?", type: "text", placeholder: "(000) 000-0000" },
    { id: "social_links", label: "Please share links to your main social media profiles (Instagram, TikTok, YouTube, etc).", type: "textarea" },
  ]},
  { title: "Section 3: Background & Experience", questions: [
    { id: "creating_duration", label: "How long have you been creating content?", type: "text" },
    { id: "platforms", label: "What platforms do you create for?", type: "text" },
    { id: "main_niche", label: "What is your main content niche or topic?", type: "text" },
    { id: "education_history", label: "Tell us about your education, previous jobs, and experience before becoming a creator.", type: "textarea" },
    { id: "lifestyle_routines", label: "Describe your lifestyle, routines, health habits, travel, and places fans know about.", help: "Describe your normal weekday and weekend routine, sleep schedule, workouts, sports, smoking, drinking, allergies, dietary restrictions, health routines, places lived, travel, and places fans know about.", type: "textarea" },
  ]},
  { title: "Story", questions: [
    { id: "secondary_niche", label: "What is your secondary content niche or topic? If none, write 'N/A.'", type: "text" },
  ]},
  { title: "Section 4: Audience & Community", questions: [
    { id: "audience_description", label: "Describe your audience in a few sentences.", type: "textarea" },
    { id: "audience_size", label: "What is your estimated audience size?", type: "text" },
    { id: "audience_interests", label: "What are your audience's main interests?", type: "textarea" },
    { id: "unique_about_you", label: "Tell us anything interesting, surprising, or unique about yourself that fans love discovering.", type: "textarea" },
  ]},
  { title: "Section 5: Creator Identity", questions: [
    { id: "creator_persona", label: "How would you describe your creator persona?", type: "textarea" },
    { id: "content_unique", label: "What makes your content unique?", type: "textarea" },
    { id: "core_values", label: "What are your core values as a creator?", type: "textarea" },
  ]},
  { title: "Section 6: Content Style & Approach", questions: [
    { id: "content_style", label: "Describe your content style.", type: "textarea" },
  ]},
  { title: "Section 7: Humour & Tone", questions: [
    { id: "humour_style", label: "How would you describe your humour style?", type: "select", options: ["Sarcastic", "Dry", "Slapstick", "Witty", "Dark", "Wholesome", "Other"] },
    { id: "overall_tone", label: "How would you describe your overall tone?", type: "select", options: ["Playful", "Serious", "Inspirational", "Conversational", "Professional", "Other"] },
  ]},
  { title: "Section 8: Texting & Messaging Style", questions: [
    { id: "uses_slang", label: "Do you use a lot of slang or abbreviations?", type: "radio", options: ["Yes", "No"] },
  ]},
  { title: "Section 9: AI Personality Traits", questions: [
    { id: "ai_traits", label: "Select the personality traits that best describe your ideal AI self.", type: "text", placeholder: "e.g. Friendly, Helpful, Witty, Sarcastic, Empathetic, Direct, Other" },
    { id: "ai_personality", label: "In a sentence or two, describe your ideal AI personality.", type: "textarea" },
  ]},
  { title: "Section 10: Content Goals & Aspirations", questions: [
    { id: "short_term_goals", label: "What are your short-term goals as a creator?", type: "textarea" },
  ]},
  { title: "Section 13: Train Your AI Voice", intro: "Write exactly how you would naturally reply to the messages below. These examples help your AI capture your real texting style, tone, emojis, humour, and personality.", questions: [
    { id: "reply_today", label: "How would you reply to: \"Hey, what are you doing today?\"", type: "textarea" },
    { id: "reply_missed", label: "How would you reply to: \"I missed you.\"", type: "textarea" },
    { id: "reply_secret", label: "How would you reply to: \"Tell me something most people don't know about you.\"", type: "textarea" },
    { id: "reply_favorite", label: "How would you reply to: \"You're my favourite creator.\"", type: "textarea" },
    { id: "reply_meet", label: "How would you reply to: \"Can we meet one day?\"", type: "textarea" },
    { id: "reply_goodnight", label: "How would you reply to: \"Goodnight ❤️\"", type: "textarea" },
    { id: "long_term_goals", label: "What are your long-term goals?", type: "textarea" },
  ]},
  { title: "Section 11: Collaboration & Partnerships", questions: [
    { id: "flirt_response", label: "If someone flirts with you, compliments you, says \"I love you,\" becomes emotionally attached, or asks to meet in person, how should your AI respond?", help: "Are there any types of content, body parts, topics, or activities the AI should never imply, promise, or suggest?", type: "textarea" },
    { id: "collabs", label: "Have you collaborated with other creators or brands?", type: "radio", options: ["Yes", "No"] },
    { id: "anything_else", label: "Is there anything else we should know about you as a creator?", type: "textarea" },
    { id: "fun_fact", label: "What's one fun fact about you?", type: "textarea" },
    { id: "monetisation", label: "Tell us about your monetisation practices and include pricing where relevant. If none, write 'N/A.'", type: "textarea" },
    { id: "boundaries", label: "Share your relationship boundaries and sexual boundaries. If not relevant, write 'N/A.'", type: "textarea" },
  ]},
  { title: "Section 12: Additional AI Context", questions: [
    { id: "pet_peeves", label: "What are your biggest pet peeves?", type: "textarea" },
    { id: "controversies", label: "Have you ever been involved in any controversies that your AI should know how to respond to?", type: "textarea" },
    { id: "top_emojis", label: "What are your 10 most-used emojis?", type: "text" },
    { id: "catch_phrases", label: "Are there any phrases or words you say all the time?", type: "textarea" },
    { id: "topics_avoid_ai", label: "What topics should your AI never discuss?", type: "textarea" },
    { id: "ai_dont_know", label: "If your AI doesn't know the answer, how should it respond?", type: "textarea" },
    { id: "texting_style", label: "How would you describe your texting style?", help: "For example: short replies, long replies, lots of emojis, lowercase, proper grammar, slang, flirty, dry, sarcastic, affectionate, chaotic, calm, etc.", type: "textarea" },
  ]},
  { title: "Identity & Personal Background", questions: [
    { id: "stage_name", label: "What is your full stage name?", type: "text" },
    { id: "star_sign", label: "What is your astrological star sign?", type: "text" },
    { id: "ethnicity", label: "What is your ethnicity or nationality?", type: "text" },
    { id: "languages", label: "Do you speak any other languages? If yes, which ones?", type: "text" },
    { id: "from_grew_up", label: "Where are you from, and where did you grow up?", type: "textarea" },
    { id: "currently_live", label: "Where do you currently live?", type: "text" },
    { id: "car", label: "What kind of car do you currently drive?", type: "text" },
    { id: "siblings_family", label: "Do you have siblings? Are you close with your family, parents, or siblings?", type: "textarea" },
    { id: "parents_status", label: "Are your parents together, divorced, remarried, or something else?", type: "text" },
    { id: "kids", label: "Do you have kids? If yes, is this public knowledge to your fans?", type: "textarea" },
    { id: "pets", label: "Do you have pets? Please include their names, personalities, and any fun details.", type: "textarea" },
    { id: "relationship_status", label: "Are you single, in a relationship, married, or something else? Is this public to your fans?", type: "textarea" },
  ]},
  { title: "Appearance Details", questions: [
    { id: "height", label: "How tall are you?", type: "text" },
    { id: "visual_appearance", label: "Describe your visual appearance, including body type, hair colour, eye colour, and your most noticeable features.", type: "textarea" },
    { id: "tattoos", label: "Do you have tattoos? If yes, where are they, what are they, and do they have meaning?", type: "textarea" },
    { id: "piercings", label: "Do you have piercings? If yes, how many and where?", type: "textarea" },
    { id: "cosmetic_work", label: "Have you had any cosmetic work done? If yes, what have you had done, and are you comfortable with fans knowing?", type: "textarea" },
    { id: "wardrobe_sizes", label: "What are your bikini and wardrobe sizes?", type: "text" },
    { id: "bra_size", label: "What is your bra size?", type: "text" },
    { id: "shoe_size", label: "What is your shoe size?", type: "text" },
    { id: "injuries", label: "Have you ever broken, hurt, or sprained anything? If yes, explain.", type: "textarea" },
  ]},
  { title: "Work, Creator History & Public Life", questions: [
    { id: "future_goals", label: "What are some of your future career goals?", type: "textarea" },
    { id: "notable_collabs", label: "Please list any notable collaborations fans may have seen or know about.", type: "textarea" },
    { id: "creator_friends", label: "Are there any creators you are friends with?", type: "textarea" },
    { id: "other_projects", label: "Are you currently working on any projects, businesses, or other work outside content?", type: "textarea" },
  ]},
  { title: "Personality Depth", questions: [
    { id: "introvert_extrovert", label: "Do you consider yourself an introvert, extrovert, or a mix?", type: "text" },
    { id: "fav_about_self", label: "What is your favourite thing about yourself?", type: "textarea" },
    { id: "fav_about_body", label: "What is your favourite thing about your body?", type: "textarea" },
    { id: "hidden_talents", label: "Do you have any hidden talents?", type: "textarea" },
    { id: "random_facts", label: "What are some random facts about you that fans would love to know?", type: "textarea" },
  ]},
  { title: "Favourite Things & Personal Preferences", questions: [
    { id: "fav_movie_genre", label: "What is your favourite movie genre?", type: "text" },
    { id: "fav_tv_movie", label: "What is your favourite TV show or movie?", type: "text" },
    { id: "fav_music_genre", label: "What is your favourite genre of music?", type: "text" },
    { id: "fav_artist", label: "Who is your favourite artist?", type: "text" },
    { id: "games", label: "Do you like playing video games or board games? If yes, what is your favourite game?", type: "textarea" },
    { id: "reading", label: "Do you enjoy reading? If yes, what is your favourite book?", type: "textarea" },
    { id: "sports_watch", label: "Do you watch sports? If yes, which ones?", type: "textarea" },
    { id: "fav_team", label: "Do you have a favourite sports team?", type: "text" },
    { id: "fav_colour", label: "What is your favourite colour?", type: "text" },
    { id: "fav_flower", label: "What is your favourite flower?", type: "text" },
    { id: "fav_foods", label: "What are your favourite foods?", type: "textarea" },
    { id: "disliked_foods", label: "What foods do you dislike?", type: "textarea" },
    { id: "party_or_home", label: "Do you prefer partying/going out or staying home?", type: "text" },
    { id: "drink_of_choice", label: "What is your drink of choice?", type: "text" },
  ]},
  { title: "Travel & Lifestyle", questions: [
    { id: "travel_places_fans", label: "What cities, states, or countries have you travelled to that fans may know about?", type: "textarea" },
    { id: "countries_travelled", label: "What countries have you travelled to?", type: "textarea" },
    { id: "fav_destination", label: "What is your favourite travel destination and why?", type: "textarea" },
    { id: "events", label: "Are there any events you attend or plan to attend, such as creator events, industry events, festivals, conventions, or AVN-style events?", type: "textarea" },
  ]},
  { title: "Relationship & Intimate Persona", questions: [
    { id: "sexual_orientation", label: "How do you describe your sexual orientation?", type: "text" },
    { id: "kinks_fetishes", label: "Do you have any kinks or fetishes you are comfortable sharing?", type: "textarea" },
    { id: "turn_ons", label: "What are your turn-ons?", type: "textarea" },
    { id: "turn_offs", label: "What are your turn-offs?", type: "textarea" },
    { id: "dom_sub", label: "Do you consider yourself more dominant, submissive, or a mix?", type: "text" },
    { id: "love_language", label: "What is your love language?", type: "text" },
    { id: "roleplay", label: "Do you enjoy roleplay? If yes, what kind?", type: "textarea" },
    { id: "relationship_wants", label: "What do you look for in a relationship?", type: "textarea" },
  ]},
  { title: "Deeper Life & Values", questions: [
    { id: "inspires_you", label: "Who inspires you the most?", type: "textarea" },
    { id: "best_advice", label: "What is the most meaningful advice you have ever received?", type: "textarea" },
    { id: "top_accomplishments", label: "What are your top 3 biggest accomplishments so far?", type: "textarea" },
    { id: "most_extreme", label: "What is the most extreme thing you have ever done?", type: "textarea" },
  ]},
];

export const CREATOR_QUESTIONNAIRE = CREATOR_QUESTIONNAIRE_SECTIONS.flatMap((section) => section.questions);
