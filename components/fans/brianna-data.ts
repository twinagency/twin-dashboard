import type { Fan, HistoryEvent, Memory, Message, Platform, Purchase } from "./types";

// Authored presentation histories, not imported conversations or verified real people.
// Keep every memory, milestone and purchase traceable to its matching message.
// Creator-scoped fixtures only: never send these records to a live data service.
type Episode = [key: string, platform: Platform, day: string, lines: [string, string, string, string]];
function conversations(episodes: Episode[]): Message[] {
  return episodes.flatMap(([key, platform, day, lines], episodeIndex) => lines.map((text, i) => ({
    id: `${key}-${i}`, platform, direction: i % 2 ? "out" as const : "in" as const,
    at: `${day}T${String(day === "2026-10-09" ? 8 : key.startsWith("oliver") ? 20 + episodeIndex % 3 : 7 + episodeIndex % 3).padStart(2,"0")}:${String((day === "2026-10-09" ? 0 : episodeIndex * 7 % 50) + i * 2).padStart(2,"0")}:00Z`, text,
  })));
}
function source(messages: Message[], id: string): Message {
  const message = messages.find(m => m.id === id);
  if (!message) throw new Error(`Missing relationship source: ${id}`);
  return message;
}
function memories(messages: Message[], rows: [string, string, string, string][]): Memory[] {
  return rows.map(([category, label, value, id], i) => {
    const m = source(messages, id);
    return { id: `${messages[0].id}-memory-${i}`, category, label, value, source: m.platform, updatedAt: m.at, sourceMessageId: m.id };
  });
}
function milestones(messages: Message[], rows: [string, string, string][]): HistoryEvent[] {
  return rows.map(([title, summary, id]) => {
    const m = source(messages, id);
    return { id: `history-${id}`, title, summary, platform: m.platform, at: m.at, sourceMessageId: m.id };
  });
}
function purchases(messages: Message[], rows: [string, Purchase["kind"], number, string][]): Purchase[] {
  return rows.map(([title, kind, amount, id]) => {
    const m = source(messages, id);
    return { id: `purchase-${id}`, title, kind, amount, currency: m.platform === "telegram" ? "Stars" : "USD", platform: m.platform, at: m.at, sourceMessageId: m.id };
  });
}

const benMessages = conversations([
  ["ben-intro", "onlyfans", "2026-08-01", [
    "Hi Brianna, I'm Ben. Found you through a behind-the-scenes clip. I'm a freelance video editor in Brisbane, so I always notice the little production details.",
    "Hi Ben! Lovely to meet you. Are you editing something interesting at the moment?",
    "A short film for a local cafe. Lots of early coffee runs! English is my first language, by the way. And Ben is perfect, no need for Benjamin.",
    "Ben it is. A cafe film sounds like a pretty good excuse for another coffee. How did the first morning of filming go?",
  ]],
  ["ben-rooftop", "onlyfans", "2026-08-04", [
    "Just bought Rooftop golden hour for $45. The warm light is lovely. I prefer those natural outdoor photos to heavily staged sets.",
    "Thank you, Ben. That light was the reason we stayed on the roof a little longer. Did the cafe shoot get a similar morning glow?",
    "It did! I'm a flat-white person, and the owner kept making them while I filmed. I normally get out with my camera before work on Sundays too.",
    "Coffee and a camera sounds like a good Sunday. I'll remember that you enjoy the outdoor sets.",
  ]],
  ["ben-telegram", "telegram", "2026-08-08", [
    "Hey, it's Ben, ben_coast on OnlyFans. This is my Telegram, ben_coast_tg. Easier to chat here between exports, but I'm still following you over there.",
    "Hey Ben, good to see you here. How is the cafe edit coming along?",
    "Nearly finished. I'm on Brisbane time, UTC+10 all year. After 6 pm my time is usually easiest. If I disappear in the day, I'm probably rendering something.",
    "Got it. I'll keep the workday gaps in mind. Hope the final export behaves itself.",
  ]],
  ["ben-walk", "telegram", "2026-08-12", [
    "Unlocked Morning boardwalk for 1,400 Stars. A short relaxed video like that is ideal while I'm waiting for an export.",
    "Glad you enjoyed it. Did the cafe film make it out of the export queue?",
    "Delivered yesterday and they loved it. Celebrated with a surf at the Sunshine Coast. I'm no expert, just happy if I stand up a few times.",
    "Delivered and approved deserves a celebration. A few good waves sounds like a solid result too.",
  ]],
  ["ben-noosa-plan", "onlyfans", "2026-08-17", [
    "Thinking about a Noosa weekend from September 12 to 14 with two friends. Mostly beach walks, a little surfing and no laptop.",
    "No laptop sounds like the important part. Have you picked somewhere to stay?",
    "A small place near the national park. I'd like to take sunrise photos, but please don't hold me to actually getting up that early.",
    "I'll ask how the sunrise plan went, not assume you managed it. A slow beach morning sounds good either way.",
  ]],
  ["ben-weekend", "onlyfans", "2026-08-21", [
    "Picked up Weekend light for $68. I like a small photo-and-video bundle where the pieces feel like the same day.",
    "Thank you. That one was put together from the same afternoon. Is your own camera getting a weekend outing?",
    "Yes, if the weather holds. One thing: I like a quick description of what's included before buying, especially if a set overlaps something I already own.",
    "That makes sense. I'll be clear about the contents and flag overlap with anything you've already picked up.",
  ]],
  ["ben-fansly", "onlyfans", "2026-08-27", [
    "Back on OnlyFans on my tablet between edits. Same cafe-editing chaos, but I have a little time to browse your collections.",
    "Welcome, Ben. Are you still planning that laptop-free Noosa weekend?",
    "Definitely. I like being able to pick up our conversation without explaining the trip again. I use Telegram for quick replies and OnlyFans when I'm browsing collections.",
    "Then we can keep the Noosa thread going wherever you happen to be browsing.",
  ]],
  ["ben-studio", "onlyfans", "2026-08-29", [
    "Bought Studio diary for $32. Loved seeing the setup before the finished shots. Keep the behind-the-scenes bits coming.",
    "Happy you liked that side of it. Do you prefer the setup clips or the final edit comparisons?",
    "Both, but a little explanation of the lighting is my favourite. I spend enough time on edit timelines to appreciate a good simple setup.",
    "Lighting notes it is. Sometimes one window does more than a whole bag of equipment.",
  ]],
  ["ben-fanvue", "onlyfans", "2026-09-02", [
    "Back browsing your OnlyFans collections. It's Ben, ben_coast, the same one chatting with you on Telegram. Curious about the new collection.",
    "Hi Ben. Good to see you back here! Noosa must be getting close.",
    "Next week. Also, I'd rather browse in my own time than get lots of repeated reminders. One message about a genuinely new set is plenty.",
    "Understood. I'll keep updates occasional and make it clear when something is new.",
  ]],
  ["ben-coastal", "onlyfans", "2026-09-04", [
    "Bought Coastal afternoon for $54. That muted colour palette is really nice, a bit like the film photos I take on beach trips.",
    "Thank you. Are you taking the film camera to Noosa?",
    "Yes, my old 35 mm camera and just two rolls. It makes me think about each frame instead of taking hundreds. I like indie and acoustic playlists when I'm editing those scans later.",
    "Two rolls sounds like a good limit. I'll want to hear which frame was your favourite once they're developed.",
  ]],
  ["ben-trip-pack", "telegram", "2026-09-11", [
    "Unlocked Weekend postcards for 1,900 Stars before we head off. Nice little bundle for the train ride up.",
    "Enjoy the trip tomorrow. Is the laptop really staying home?",
    "It is! September 12 to 14, completely off work. If I don't reply, I'm probably outside. Please leave anything non-urgent until I'm back.",
    "Absolutely. Have a great weekend with your friends. We can catch up after the 14th.",
  ]],
  ["ben-noosa-return", "telegram", "2026-09-15", [
    "Back from Noosa. Actually made the sunrise on Sunday! Tea Tree Bay was the highlight, though I got caught by a wave trying to protect the camera.",
    "You did it! Did the camera survive its encounter with the sea?",
    "All safe, just wet shoes. We walked the coastal track and had fish tacos after. I'll get the film developed this week and tell you if the sunrise frame worked.",
    "Wet shoes are a fair price for a sunrise story. Let me know how the film comes back.",
  ]],
  ["ben-window", "onlyfans", "2026-09-16", [
    "Bought Window light diary for $49. The natural-light video feels really calm after a busy day. I'm back at the desk catching up now.",
    "Welcome back to the edit queue. Was it a gentle return or straight into deadlines?",
    "Straight in. A restaurant launch film is due October 10. I enjoy the work, but short voice notes or a few lines are easier than big walls of text when I'm on deadline.",
    "A few lines while you're busy, then. How did the first cut go?",
  ]],
  ["ben-film-result", "onlyfans", "2026-09-22", [
    "Picked up Afterglow portraits for $38. Also, the Noosa film came back! The sunrise photo at Tea Tree Bay is the one I want to print.",
    "The sunrise plan paid off. Have you decided how big to print it?",
    "Probably A3 for the desk wall. Please ask me about that print next time, otherwise I'll leave it sitting in a folder for months.",
    "A3 for the desk wall. I'll check whether the photo has escaped the folder yet.",
  ]],
  ["ben-sunday", "onlyfans", "2026-09-28", [
    "Bought Slow Sunday for $62. A quieter set was exactly the mood I wanted. My restaurant edit is finally in a good place too.",
    "That sounds like progress on both fronts. Has the client seen the new cut?",
    "Yes, only small changes. I booked an acoustic gig for October 17 as a reward once the launch is done. Going with the same friends from Noosa.",
    "A good thing to look forward to after the delivery. I'll ask about the gig after the 17th.",
  ]],
  ["ben-october", "onlyfans", "2026-10-02", [
    "Bought October journal for $79 after reading the contents. Thanks for making it clear these are new pieces and not Weekend light again.",
    "You're welcome. I remembered you already have Weekend light. How is the restaurant deadline looking?",
    "Still October 10. Nearly there. I prefer one thoughtful recommendation that fits what I like, rather than a long list of offers.",
    "That helps. I'll keep suggestions specific and check what you already own first.",
  ]],
  ["ben-quick-note", "telegram", "2026-10-05", [
    "Unlocked Coffee break diary for 2,100 Stars. Perfect length for an actual coffee break between revisions.",
    "Good timing. Is the restaurant film down to the final tweaks now?",
    "Colour grade and sound mix left. I like that you remember the job, but no need to send a check-in every day. I'll let you know once it's delivered.",
    "Of course. I'll leave you room to finish and pick it up when you have an update.",
  ]],
  ["ben-print", "telegram", "2026-10-07", [
    "The Tea Tree Bay print is finally ordered, A3 like we talked about. Should arrive next week. Thought you'd appreciate that I actually did it.",
    "It escaped the folder! Where is it going on the desk wall?",
    "Just above the monitor. It'll be a reminder to leave the house between projects. Ask me next week if it's arrived, please.",
    "I will. Hope the print looks as good on paper as it did in the scan.",
  ]],
  ["ben-evening", "onlyfans", "2026-10-08", [
    "Bought Evening edits for $44. I checked the contents and it's different from Studio diary, so that's all good.",
    "Yes, different footage and photos. Is your own evening full of edits too?",
    "Final sound pass tonight. Keeping tomorrow quiet so I can deliver on Saturday. After that I can actually enjoy the October 17 gig without thinking about work.",
    "Hope the sound pass goes smoothly. You've earned a quiet evening after delivery.",
  ]],
  ["ben-current", "telegram", "2026-10-09", [
    "Final export is running. Client review tomorrow morning, still on track for October 10. How has your Friday been?",
    "Pretty good, thank you. That's a nice place to be after all those revisions. Did you get away from the desk for a coffee?",
    "Quick flat white, then back to checking the file. Remind me to tell you how the client review goes when we next chat, and then the print should turn up next week.",
    "I will. Good luck with the review tomorrow, Ben. I'm looking forward to hearing how it lands.",
  ]],
]);

const oliverMessages = conversations([
  ["oliver-intro", "onlyfans", "2026-08-17", [
    "Hi Brianna, I'm Oliver from Bristol. I work in live sound, mostly small venues. Found your studio clip while winding down after a gig.",
    "Hi Oliver. A late night at a venue sounds busy. Was it a good show?",
    "Really good jazz trio. I speak English and Oliver is what everyone calls me. I often read messages after shifts, but there's no need to reply straight away.",
    "Lovely to meet you. A jazz trio sounds like a nice way to end the weekend, even from behind the mixing desk.",
  ]],
  ["oliver-first", "onlyfans", "2026-08-20", [
    "Bought Studio afternoon for $28. I liked the quieter feel and the little details in the background, especially the record player.",
    "Thank you. Do you collect records yourself?",
    "A modest pile of soul and jazz vinyl. I go to a record shop on Gloucester Road when I have a free afternoon. No rare collection, just things I actually listen to.",
    "Records that get played are the best kind. What was the last one you picked up?",
  ]],
  ["oliver-routine", "onlyfans", "2026-08-24", [
    "A used Bill Withers album. Sunday mornings are usually records, a filter coffee and absolutely no soundcheck.",
    "That sounds like a proper day off. Do you ever get tired of listening to music after a week of shows?",
    "Sometimes I go for a quiet walk with my 35 mm camera instead. I like old signs, shopfronts and rainy streets. Nothing very polished.",
    "Those everyday details make interesting photos. Bristol must give you plenty to work with.",
  ]],
  ["oliver-window", "onlyfans", "2026-08-28", [
    "Picked up Rainy window for $24. Natural window light is my favourite. I tend to choose photos over longer videos.",
    "Thank you. I'll keep the photo preference in mind. Have you taken the camera out this week?",
    "Only one roll, between shifts. I'm using OnlyFans only for this, by the way. I'm not on your Telegram, so please keep our chat here.",
    "Of course, Oliver. We can keep everything here on OnlyFans.",
  ]],
  ["oliver-bath-plan", "onlyfans", "2026-09-01", [
    "Booked a day in Bath for September 6. Bringing the camera, walking by the river and hoping to find a good bookshop.",
    "A camera and a bookshop sounds like a good day. Is it a work trip or completely your own time?",
    "Completely off. I like short train trips where I don't have to make a huge itinerary. I'll tell you whether the weather cooperates.",
    "Please do. Even a rainy street can make a good photograph, from what you've told me.",
  ]],
  ["oliver-weekend", "onlyfans", "2026-09-04", [
    "Bought Weekend notes for $36. A small mixed bundle works for me if most of it is photos and the video is short.",
    "That one has the photo set and a short diary clip. Are you all set for Bath on Sunday?",
    "Train booked. I appreciate knowing the exact contents first. I don't want to buy the same photos twice if they appear in a later bundle.",
    "I'll flag any overlap clearly. Have a good train ride on Sunday.",
  ]],
  ["oliver-bath-return", "onlyfans", "2026-09-08", [
    "Bath was lovely. Walked along the river, found a second-hand bookshop and took a whole roll around the old shopfronts. Only one short shower.",
    "That sounds like the day you had in mind. Did the bookshop win you over?",
    "Yes, came home with a photography book I didn't plan to buy. Waiting for the film scans now. The frame of a blue bookshop door might be the keeper.",
    "An unplanned photography book feels very on theme. Let me know how the door photo comes out.",
  ]],
  ["oliver-soft-light", "onlyfans", "2026-09-12", [
    "Bought Soft light portraits for $30. These are exactly the sort of relaxed portraits I like, without lots of effects.",
    "Thank you, Oliver. Has your own film come back yet?",
    "Not yet. A busy run of shows until the 20th, so replies might be slow. Please don't chase me if I'm quiet, I'll catch up on my day off.",
    "No problem. Hope the run goes well. We can catch up when you have some breathing room.",
  ]],
  ["oliver-boundaries", "onlyfans", "2026-09-18", [
    "Quick hello between soundchecks. I enjoy the small everyday updates here, like what you're reading or a photo from a walk.",
    "It's nice to hear that. Are you nearly through the busy run?",
    "Two more nights. I prefer straightforward messages and one question at a time, not a big list to answer. A quiet chat is better than constant sales reminders.",
    "Understood. One question for now: what's the first thing you're doing on your day off?",
  ]],
  ["oliver-film", "onlyfans", "2026-09-22", [
    "Bought Sunday contact sheet for $42. Also, my Bath scans arrived. The blue door photo worked, but my favourite is a rainy reflection by the river.",
    "A surprise favourite. What made that frame stand out?",
    "The reflection makes the buildings look like a watercolour. I'm choosing six pictures for a small printed album, not posting the whole roll online.",
    "Six favourites sounds like a thoughtful little record of the day. I'd love to hear which ones make the final cut.",
  ]],
  ["oliver-autumn", "onlyfans", "2026-09-27", [
    "Picked up Autumn window for $26. I like that you listed it as a new set, separate from Rainy window.",
    "Yes, all new photos. How is the six-picture album coming together?",
    "Down to eight, so two still need to go. Work is calmer this week. I usually check this app around 9 or 10 pm UK time, except when a show runs late.",
    "Good to know. No hurry on the last two choices; sometimes leaving it a day makes the favourites clearer.",
  ]],
  ["oliver-gig", "onlyfans", "2026-09-30", [
    "Going to a small acoustic show on October 16 as an audience member for once. Determined not to spend the whole night judging the sound mix.",
    "That might be harder than it sounds. Are you going with anyone?",
    "A friend from work. We've promised not to stand next to the mixing desk. Ask me afterwards if we managed it.",
    "Deal. After the 16th, I want to know whether you actually watched from the audience.",
  ]],
  ["oliver-october", "onlyfans", "2026-10-02", [
    "Bought October stills for $38. Thanks for saying there aren't any repeats from Sunday contact sheet.",
    "You're welcome. I know keeping the sets distinct matters to you. Did you finish narrowing down the album?",
    "Six chosen, finally. The river reflection goes first and the blue door second. I want to order a small square print book over the weekend.",
    "That sounds like a strong opening pair. Let me know how the print order goes.",
  ]],
  ["oliver-album", "onlyfans", "2026-10-05", [
    "Album ordered yesterday, delivery estimate October 12. I went with matte paper because the scans felt too shiny on gloss.",
    "That seems right for those rainy street photos. Are you happy with the final sequence?",
    "Yes. Six pictures was a useful limit. Please ask about it next week once it's arrived. I'm curious whether the reflection survives being printed small.",
    "I will. Hope the printed version keeps the detail you liked in the scan.",
  ]],
  ["oliver-studio-notes", "onlyfans", "2026-10-08", [
    "Picked up Studio notes for $44. The photo-heavy mix and short clip suit me. I read the contents before buying, so no surprises.",
    "Thank you, Oliver. Is this week giving you some time away from the venue?",
    "One more Friday show, then a free Sunday. Record shop and coffee if it's dry. I haven't picked a new record yet.",
    "A free Sunday sounds well timed. I'll be interested to hear what you find in the shop.",
  ]],
  ["oliver-current", "onlyfans", "2026-10-09", [
    "Morning check-in before loading equipment. Print book should still arrive on Monday. I'll tell you if that river reflection looks any good on paper.",
    "Hope the load-in goes smoothly. Monday is close now. Is tonight's show a big setup?",
    "A four-piece band, so manageable. I might be slow replying until tomorrow. After that it's the record shop on Sunday and the acoustic show next Friday.",
    "Have a good show tonight. Catch up when you're free, and we'll see whether Monday's post brings the book.",
  ]],
]);

export const briannaFans: Fan[] = [
  {
    id: "briana-ben", creatorId: "briana", name: "Ben", initials: "B", color: "#417fa1",
    firstSeen: benMessages[0].at, unread: 0,
    summary: "Ben is a Brisbane video editor who first connected with Brianna in August. The same relationship now continues across OnlyFans and Telegram, with Telegram his preferred place for quick chats. Shared threads include his Noosa trip, film photography and the restaurant launch film due on 10 October. His final export is running; the next natural follow-ups are the client review, his Tea Tree Bay print and the 17 October acoustic gig.",
    accounts: [
      { platform: "onlyfans", username: "ben_coast", linkedAt: benMessages[0].at },
      { platform: "telegram", username: "ben_coast_tg", linkedAt: source(benMessages, "ben-telegram-0").at },
    ],
    messages: benMessages,
    memories: memories(benMessages, [
      ["Personal details", "Home and work", "Based in Brisbane and works as a freelance video editor. First discovered Brianna through a behind-the-scenes clip and noticed the production details.", "ben-intro-0"],
      ["Personal details", "Preferred name and language", "Goes by Ben rather than Benjamin. English is his first language. Early conversation centred on a film he was making for a local cafe.", "ben-intro-2"],
      ["Personal details", "Local time and availability", "Brisbane, UTC+10 year-round. Usually finds it easiest to chat after 6 pm locally; daytime gaps often mean he is waiting on renders or working.", "ben-telegram-2"],
      ["Personal details", "Current project", "Restaurant launch film due 10 October. On 9 October the final export was running, with client review planned for the following morning.", "ben-current-0"],
      ["Interests & routines", "Coffee and Sunday photography", "Prefers a flat white. Likes taking his camera out before work on Sundays; coffee and early light were recurring topics during the cafe project.", "ben-rooftop-2"],
      ["Interests & routines", "Surfing", "Enjoys casual surfing on the Sunshine Coast. Describes himself as a beginner and celebrated the cafe film delivery with a surf.", "ben-walk-2"],
      ["Interests & routines", "Film photography", "Uses an older 35 mm camera and took only two rolls to Noosa. Likes the slower, more deliberate process of choosing each frame.", "ben-coastal-2"],
      ["Interests & routines", "Music", "Listens to indie and acoustic playlists while editing film scans. Music is a useful conversational link alongside photography and work.", "ben-coastal-2"],
      ["Conversation preferences", "Channel habits", "Uses Telegram for quick replies. Browses collections on OnlyFans and appreciates continuing the same conversation without repeating personal context.", "ben-fansly-2"],
      ["Conversation preferences", "Message length", "During deadlines, prefers short voice notes or a few lines instead of long messages. This preference came up when the restaurant film entered its busy phase.", "ben-window-2"],
      ["Conversation preferences", "Frequency of updates", "Prefers browsing at his own pace. One update about a genuinely new set is enough; avoid repeating reminders across his linked accounts.", "ben-fanvue-2"],
      ["Conversation preferences", "Room during deadlines", "Asked for space while finishing the colour grade and sound mix. Appreciates the project being remembered, but does not want daily check-ins.", "ben-quick-note-2"],
      ["Shared history", "Cafe film delivered", "Delivered the local cafe film on 11 August and reported that the client loved it. Celebrated with a surf the following day.", "ben-walk-2"],
      ["Shared history", "Noosa weekend", "Returned from the 12–14 September trip with friends. Managed a Sunday sunrise at Tea Tree Bay; the camera stayed safe despite wet shoes from a wave.", "ben-noosa-return-0"],
      ["Shared history", "Coastal track and tacos", "Walked the Noosa coastal track and had fish tacos afterwards. Promised to report back on the film once it was developed.", "ben-noosa-return-2"],
      ["Shared history", "Favourite Noosa frame", "The film scans came back successfully. Chose the Tea Tree Bay sunrise for an A3 print above his desk, carrying the trip conversation into OnlyFans.", "ben-film-result-0"],
      ["Content preferences", "Natural outdoor photos", "Likes warm, natural outdoor light more than heavily staged sets. Mentioned this after purchasing Rooftop golden hour.", "ben-rooftop-0"],
      ["Content preferences", "Behind the scenes", "Enjoys seeing the setup as well as the final result. Especially interested in a simple explanation of lighting choices.", "ben-studio-2"],
      ["Content preferences", "Clear contents and ownership", "Wants a brief contents description before buying and a warning if material overlaps an earlier purchase. Check ownership across OnlyFans and Telegram.", "ben-weekend-2"],
      ["Content preferences", "Relevant recommendations", "Prefers one thoughtful recommendation over a long offer list. October journal was chosen after confirming it did not repeat Weekend light.", "ben-october-2"],
      ["Open follow-ups", "Client review on 10 October", "At the next conversation, ask how the restaurant film's client review went. Ben explicitly asked to pick this up after the final export.", "ben-current-2"],
      ["Open follow-ups", "A3 print arrival", "Tea Tree Bay A3 print was ordered by 7 October and is expected the following week. Ask whether it has arrived and how it looks above the monitor.", "ben-print-2"],
      ["Open follow-ups", "Acoustic gig on 17 October", "Booked a 17 October acoustic gig with the friends from Noosa as a reward after the restaurant launch. Ask about the evening after that date.", "ben-sunday-2"],
      ["Open follow-ups", "Current work context", "Final sound pass was planned for 8 October, with 9 October kept quiet before Saturday delivery. Keep the next reply brief and let him finish.", "ben-evening-2"],
    ]),
    purchases: purchases(benMessages, [
      ["Rooftop golden hour", "Photo", 45, "ben-rooftop-0"], ["Morning boardwalk", "Video", 1400, "ben-walk-0"],
      ["Weekend light", "Bundle", 68, "ben-weekend-0"], ["Studio diary", "Video", 32, "ben-studio-0"],
      ["Coastal afternoon", "Bundle", 54, "ben-coastal-0"], ["Weekend postcards", "Bundle", 1900, "ben-trip-pack-0"],
      ["Window light diary", "Video", 49, "ben-window-0"], ["Afterglow portraits", "Photo", 38, "ben-film-result-0"],
      ["Slow Sunday", "Bundle", 62, "ben-sunday-0"], ["October journal", "Bundle", 79, "ben-october-0"],
      ["Coffee break diary", "Video", 2100, "ben-quick-note-0"], ["Evening edits", "Bundle", 44, "ben-evening-0"],
    ]),
    history: milestones(benMessages, [
      ["First conversation", "Met on OnlyFans through an interest in behind-the-scenes production. Introduced himself as a Brisbane video editor.", "ben-intro-0"],
      ["Telegram added to the relationship", "Identified his OnlyFans and Telegram usernames; continued the cafe film conversation on the new channel.", "ben-telegram-0"],
      ["First project followed through", "Cafe film delivered and approved. Celebrated with a surf, providing continuity beyond the initial introduction.", "ben-walk-2"],
      ["Channel preferences confirmed", "Uses Telegram for quick replies and OnlyFans to browse collections. Noosa plans continued across the same relationship.", "ben-fansly-2"],
      ["Content update preferences saved", "Asked for occasional updates about new collections while browsing at his own pace.", "ben-fanvue-2"],
      ["Noosa trip completed", "Reported back on the Sunday sunrise at Tea Tree Bay and the camera's close encounter with a wave.", "ben-noosa-return-0"],
      ["Film scans returned", "Chose the sunrise photograph as the frame worth printing. The trip story continued on OnlyFans.", "ben-film-result-0"],
      ["October collection added", "Bought October journal after checking it did not overlap the Weekend light bundle already owned.", "ben-october-0"],
      ["Print ordered", "Ordered the Tea Tree Bay photograph at A3, following through on the earlier conversation about printing it.", "ben-print-0"],
      ["Restaurant film enters final review", "Final export running with the client review scheduled for 10 October. Next follow-up is the delivery outcome.", "ben-current-0"],
    ]),
    notes: [
      { id: "ben-note-channels", at: "2026-09-02T23:00:00Z", text: "Same Ben across OnlyFans and Telegram. Keep the creator relationship together, while replying within the channel he used. Telegram is his usual quick-chat channel." },
      { id: "ben-note-ownership", at: "2026-10-02T23:00:00Z", text: "Check combined purchase history before suggesting a collection. He explicitly checks for overlap and prefers one relevant suggestion with a clear contents description." },
      { id: "ben-note-print", at: "2026-10-07T23:00:00Z", text: "Noosa sunrise thread has progressed from trip planning to film scans to an A3 print order. Follow up on delivery next week, not on choosing a photo again." },
      { id: "ben-note-current", at: "2026-10-09T08:08:00Z", text: "Current context: restaurant film review on 10 October. Keep replies brief while he finishes. Next week: print arrival, then the acoustic gig on 17 October." },
    ],
    suggestedReplies: {
      telegram: "Hope tomorrow's client review goes smoothly, Ben. Let me know how it lands when you get a breather, and we'll catch up about the print next week.",
      onlyfans: "Hope the final restaurant edit is coming together, Ben. I'll keep any collection suggestions specific and check them against what you already have.",
    },
  },
  {
    id: "briana-oliver", creatorId: "briana", name: "Oliver", initials: "O", color: "#8b719e",
    firstSeen: oliverMessages[0].at, unread: 0,
    summary: "Oliver is a Bristol live-sound engineer who has been chatting with Brianna on OnlyFans since August. He enjoys jazz and soul records, filter coffee and unpolished film photography. Their ongoing story follows his September day trip to Bath and the six-photo book now due on 12 October. He has a venue shift tonight, a record-shop visit planned for Sunday and an acoustic show as an audience member on 16 October.",
    accounts: [{ platform: "onlyfans", username: "oliver_bristol", linkedAt: oliverMessages[0].at }],
    messages: oliverMessages,
    memories: memories(oliverMessages, [
      ["Personal details", "Home and occupation", "Lives in Bristol and works in live sound, mainly at small venues. First found Brianna's studio clip while winding down after a jazz trio's show.", "oliver-intro-0"],
      ["Personal details", "Name and language", "Uses Oliver and speaks English. Often reads messages after venue shifts; explicitly says there is no expectation of an immediate reply.", "oliver-intro-2"],
      ["Personal details", "Local routine", "Usually checks OnlyFans around 9–10 pm UK time, except when a show runs late. His work schedule changes with the venue programme.", "oliver-autumn-2"],
      ["Interests & routines", "Record collecting", "Keeps a modest soul and jazz vinyl collection and visits a Gloucester Road record shop. Values records he will play rather than collecting rarities.", "oliver-first-2"],
      ["Interests & routines", "Sunday coffee and music", "Enjoys filter coffee and records on a free Sunday morning. Last mentioned finding a used Bill Withers album.", "oliver-routine-0"],
      ["Interests & routines", "Street photography", "Takes a 35 mm camera on quiet walks. Likes old signs, shopfronts and rainy streets, with an everyday rather than polished feel.", "oliver-routine-2"],
      ["Conversation preferences", "OnlyFans only", "Explicitly uses OnlyFans for this relationship and is not connected to Brianna on Telegram. Keep this conversation on OnlyFans.", "oliver-window-2"],
      ["Conversation preferences", "No chasing during shows", "Asked not to be chased when work makes replies slow. Catches up on days off; a quiet period is not an invitation to send repeated reminders.", "oliver-soft-light-2"],
      ["Conversation preferences", "Straightforward conversation", "Prefers one question at a time and ordinary everyday updates. Enjoys a quiet chat more than a list of questions or constant sales reminders.", "oliver-boundaries-2"],
      ["Shared history", "Bath day trip", "Visited Bath on 6 September. Walked by the river, explored old shopfronts and found a second-hand bookshop; only one brief shower interrupted the day.", "oliver-bath-return-0"],
      ["Shared history", "Bookshop discovery", "Brought home an unplanned photography book. Initially thought a frame of a blue bookshop door would be the best shot on the roll.", "oliver-bath-return-2"],
      ["Shared history", "Unexpected favourite frame", "When the scans returned, the rainy river reflection became his favourite. Started choosing six images for a small printed album instead of posting the whole roll.", "oliver-film-2"],
      ["Shared history", "Album sequence chosen", "Finished selecting six images by 2 October. Chose the river reflection first and the blue door second for a small square print book.", "oliver-october-2"],
      ["Content preferences", "Photos and natural light", "Prefers photos to long videos and particularly likes natural window light. Rainy window matched that preference.", "oliver-window-0"],
      ["Content preferences", "Small photo-led bundles", "Likes a small mixed bundle when most of the content is photos and the video is short. Weekend notes was an example of the right balance.", "oliver-weekend-0"],
      ["Content preferences", "Avoid duplicate purchases", "Wants exact contents before buying and a clear warning if older photos appear in a new bundle. Check his owned collections before recommending anything.", "oliver-weekend-2"],
      ["Open follow-ups", "Print book due 12 October", "Ordered the Bath photo book on 4 October using matte paper. Delivery estimate is 12 October; ask after arrival how the small river reflection printed.", "oliver-album-0"],
      ["Open follow-ups", "Acoustic show on 16 October", "Going as an audience member with a friend from work. They promised to stay away from the mixing desk; he asked to be reminded about that afterwards.", "oliver-gig-2"],
      ["Open follow-ups", "Sunday record-shop visit", "After Friday's show, has a free Sunday for records and coffee if the weather holds. Has not chosen the next record yet.", "oliver-studio-notes-2"],
      ["Open follow-ups", "Friday venue shift", "Loading equipment for a four-piece band on 9 October and may reply slowly until the next day. Leave space around the shift before resuming the chat.", "oliver-current-2"],
    ]),
    purchases: purchases(oliverMessages, [
      ["Studio afternoon", "Photo", 28, "oliver-first-0"], ["Rainy window", "Photo", 24, "oliver-window-0"],
      ["Weekend notes", "Bundle", 36, "oliver-weekend-0"], ["Soft light portraits", "Photo", 30, "oliver-soft-light-0"],
      ["Sunday contact sheet", "Bundle", 42, "oliver-film-0"], ["Autumn window", "Photo", 26, "oliver-autumn-0"],
      ["October stills", "Photo", 38, "oliver-october-0"], ["Studio notes", "Bundle", 44, "oliver-studio-notes-0"],
    ]),
    history: milestones(oliverMessages, [
      ["First OnlyFans conversation", "Introduced himself after a jazz trio's show. Shared his Bristol home and work in live sound.", "oliver-intro-0"],
      ["Music becomes a recurring topic", "First purchase led into a discussion of soul and jazz records and his local record shop.", "oliver-first-2"],
      ["Single-channel preference confirmed", "Confirmed he wants to keep the relationship on OnlyFans, with no accounts on Brianna's other platforms.", "oliver-window-2"],
      ["Bath day trip completed", "Returned with a roll of river and shopfront photographs and a bookshop discovery.", "oliver-bath-return-0"],
      ["Film scans inspire a print project", "A rainy reflection became the favourite image. Began selecting six photos for a small album.", "oliver-film-2"],
      ["An evening in the audience planned", "Booked a 16 October acoustic show as a listener, with a promise to avoid the mixing desk.", "oliver-gig-0"],
      ["Six-photo book ordered", "Ordered the Bath book on matte paper. Delivery estimate is 12 October.", "oliver-album-0"],
      ["Current plans confirmed", "Friday's venue shift, Sunday's record-shop visit and next Friday's acoustic show set the context for the next conversations.", "oliver-current-2"],
    ]),
    notes: [
      { id: "oliver-note-platform", at: "2026-08-28T23:00:00Z", text: "OnlyFans only, by his explicit preference. Do not imply there are linked accounts elsewhere or continue a conversation on another platform." },
      { id: "oliver-note-tone", at: "2026-09-18T23:00:00Z", text: "Keep messages straightforward and ask one question at a time. Venue shifts explain slow replies; he asked for space rather than repeated check-ins." },
      { id: "oliver-note-album", at: "2026-10-05T23:00:00Z", text: "Bath story is now at the printed-book stage. Six photos chosen, matte paper ordered, due 12 October. Ask about the finished book rather than whether scans have returned." },
      { id: "oliver-note-next", at: "2026-10-09T08:08:00Z", text: "Upcoming topics: Sunday record shop, Monday print-book delivery and 16 October acoustic show. He and his friend promised to stay away from the mixing desk." },
    ],
    suggestedReplies: { onlyfans: "Hope tonight's show goes smoothly, Oliver. Catch up when you're free, and I'll be interested to hear how the river reflection looks when the book arrives on Monday." },
  },
];
