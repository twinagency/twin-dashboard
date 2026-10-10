// Presentation fixtures only. Never sent to a platform or persisted to the CRM.
export const MOVIE_DEMO_HREF = '/inbox?creator=briana&platform=onlyfans&presentation=movie-night';
export const DEMO_PRICE = 18;
export type DemoMessage = { id: string; role: 'fan' | 'creator' | 'system'; text: string; offer?: boolean; manual?: boolean };
export const DEMO_HISTORY: DemoMessage[] = [
  { id: 'history-films', role: 'fan', text: 'Thrillers every time. I always try to guess the ending. No spoilers though 😂' },
  { id: 'history-popcorn', role: 'fan', text: 'Friday movie nights are my thing. Salted popcorn, obviously.' },
  { id: 'history-reply', role: 'creator', text: 'Okay, thriller guy. I expect your best theory before the ending 😉' },
  { id: 'history-photos', role: 'fan', text: 'Your natural close-up photos are my favourites. The little smile gets me every time.' },
];
export const DEMO_MEMORIES = [
  { id: 'films', label: 'Movie taste', value: 'Thrillers. Likes guessing the ending. No spoilers.', source: 'history-films' },
  { id: 'popcorn', label: 'Friday ritual', value: 'A film and salted popcorn on a quiet night in.', source: 'history-popcorn' },
  { id: 'photos', label: 'Photo preference', value: 'Natural close-ups and candid smiles.', source: 'history-photos' },
];
export const DEMO_OWNED = [
  { id: 'outdoor', title: 'Outdoor moments', amount: 29 },
  { id: 'mirror', title: 'Behind the scenes', amount: 29 },
  { id: 'coffee', title: 'Coffee break diary', amount: 24 },
  { id: 'weekend', title: 'Weekend notes', amount: 44 },
];
type Event = { kind: 'fan' | 'creator' | 'context' | 'offer' | 'purchase' | 'memory'; text: string; delay: number };
export type DemoScene = { title: string; cue: string; memories: string[]; events: Event[] };
export const DEMO_SCENES: DemoScene[] = [
  { title: 'A familiar Friday', cue: 'Show how the reply draws on his earlier movie-night ritual.', memories: ['films', 'popcorn'], events: [
    { kind: 'fan', text: 'Finally on the sofa. Thriller or comedy tonight? You choose 😏', delay: 2000 },
    { kind: 'context', text: 'Retrieved his film preference and Friday-night ritual.', delay: 4500 },
    { kind: 'creator', text: 'Thriller, obviously. You love trying to guess the ending 😂', delay: 6500 },
    { kind: 'creator', text: 'Tell me you remembered the salted popcorn though.', delay: 4500 },
  ] },
  { title: 'She remembers the details', cue: 'Let the remembered detail land before advancing.', memories: ['popcorn'], events: [
    { kind: 'fan', text: 'You remembered that? 😂 Yeah, got it. Just missing some company.', delay: 2000 },
    { kind: 'context', text: 'Kept the remembered detail and matched his playful tone.', delay: 4500 },
    { kind: 'creator', text: 'Of course I remembered. You were very passionate about the sweet popcorn being wrong 😌', delay: 7500 },
    { kind: 'creator', text: 'Although I feel like I’d be terrible company for actually paying attention to the film 😉', delay: 6000 },
  ] },
  { title: 'A playful reply', cue: 'The conversation follows what he actually says next.', memories: ['films', 'photos'], events: [
    { kind: 'fan', text: 'Oh yeah? What would you do? 😉', delay: 2000 },
    { kind: 'context', text: 'Continued the movie-night conversation with light teasing.', delay: 4500 },
    { kind: 'creator', text: 'Steal the best spot on the sofa. Give you that little smile you said you liked.', delay: 6500 },
    { kind: 'creator', text: 'Then act completely innocent when you ask to rewind 😇', delay: 4500 },
  ] },
  { title: 'He asks to see it', cue: 'The request comes naturally from the conversation.', memories: ['photos'], events: [
    { kind: 'fan', text: 'That smile is unfair 😂 Have you got a photo for me?', delay: 2000 },
    { kind: 'context', text: 'Matched his request to his preference for candid close-ups.', delay: 4500 },
    { kind: 'creator', text: 'I have a little close-up that fits this conversation perfectly. Very much your kind of photo 😉', delay: 7500 },
    { kind: 'creator', text: 'Want to see it?', delay: 3500 },
  ] },
  { title: 'A relevant, unseen photo', cue: 'Show the selected photo and the ownership check in the right panel.', memories: ['photos'], events: [
    { kind: 'fan', text: 'Go on then. Something I haven’t already seen 😏', delay: 2000 },
    { kind: 'context', text: 'Checked four previous purchases. In the moment is not owned.', delay: 4500 },
    { kind: 'offer', text: 'This is the smile I meant. Try not to lose your place in the film 😉', delay: 7000 },
  ] },
  { title: 'Purchase and continuity', cue: 'Watch the offer, purchase count and fan record update together.', memories: ['photos', 'films'], events: [
    { kind: 'fan', text: 'Okay, you win. Unlocking it now 😂', delay: 2000 },
    { kind: 'purchase', text: 'In the moment unlocked. US$18.00 added to this demo relationship.', delay: 5500 },
    { kind: 'creator', text: 'There you go 😌 Now press play. I still want your theory before the ending.', delay: 6000 },
    { kind: 'memory', text: 'Tonight: thriller night. In the moment purchased. Follow up about his ending prediction.', delay: 3500 },
  ] },
  { title: 'The conversation continues', cue: 'Finish on a reply that brings the conversation back to him.', memories: ['films'], events: [
    { kind: 'fan', text: 'The movie has some serious competition now 😂', delay: 2000 },
    { kind: 'creator', text: 'I’ll take that compliment 😉 But no pretending you guessed the twist if you spent the whole film messaging me.', delay: 7500 },
  ] },
];
export type DemoState = {
  scene: number; cursor: number; playing: boolean; auto: boolean; mode: 'Autonomous' | 'Human';
  messages: DemoMessage[]; offered: boolean; purchased: boolean; memorySaved: boolean;
  activity: string[]; context: string;
};
export const newMovieDemo = (): DemoState => ({ scene: -1, cursor: 0, playing: false, auto: false, mode: 'Autonomous', messages: [], offered: false, purchased: false, memorySaved: false, activity: [], context: 'Ready to use the conversation history.' });
export type DemoAction = { type: 'start'; auto?: boolean } | { type: 'tick' } | { type: 'pause' } | { type: 'takeover' } | { type: 'resume' } | { type: 'reset' } | { type: 'manual'; text: string };
export function movieDemoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === 'reset') return newMovieDemo();
  if (action.type === 'pause') return { ...state, playing: false, auto: false };
  if (action.type === 'takeover') return { ...state, playing: false, auto: false, mode: 'Human', activity: [...state.activity, 'Human takeover. Scheduled demo replies paused.'] };
  if (action.type === 'resume') return { ...state, mode: 'Autonomous', activity: [...state.activity, 'Autonomous mode restored. Ready to continue.'] };
  if (action.type === 'manual') {
    if (state.mode !== 'Human' || !action.text.trim()) return state;
    return { ...state, messages: [...state.messages, { id: `manual-${state.messages.length}`, role: 'creator', text: action.text.trim().slice(0,2000), manual: true }], activity: [...state.activity, 'Operator added a reply to the demo conversation.'] };
  }
  if (action.type === 'start') {
    if (state.playing || state.mode === 'Human') return state;
    const complete = state.scene < 0 || state.cursor >= DEMO_SCENES[state.scene].events.length;
    const scene = complete ? state.scene + 1 : state.scene;
    if (scene >= DEMO_SCENES.length) return { ...state, auto: false };
    return { ...state, scene, cursor: complete ? 0 : state.cursor, playing: true, auto: action.auto ?? state.auto };
  }
  if (!state.playing || state.mode !== 'Autonomous') return state;
  const scene = DEMO_SCENES[state.scene], event = scene?.events[state.cursor];
  if (!event) return state;
  const cursor = state.cursor + 1, finished = cursor === scene.events.length;
  // Manual presentation holds on context and purchase updates for the voice-over.
  const presenterHold = !state.auto && (event.kind === 'context' || event.kind === 'purchase');
  const next: DemoState = { ...state, cursor, playing: !finished && !presenterHold, auto: finished && state.scene === DEMO_SCENES.length - 1 ? false : state.auto };
  const id = `movie-${state.scene}-${state.cursor}`;
  if (event.kind === 'fan' || event.kind === 'creator') next.messages = [...state.messages, { id, role: event.kind, text: event.text }];
  if (event.kind === 'context') { next.context = event.text; next.activity = [...state.activity, event.text]; }
  if (event.kind === 'offer' && !state.offered) { next.offered = true; next.messages = [...state.messages, { id, role: 'creator', text: event.text, offer: true }]; next.activity = [...state.activity, 'In the moment offered for US$18.00. Awaiting simulated purchase.']; }
  if (event.kind === 'purchase' && state.offered && !state.purchased) { next.purchased = true; next.messages = [...state.messages, { id, role: 'system', text: 'Purchased In the moment · US$18.00' }]; next.activity = [...state.activity, event.text]; next.context = 'Purchase recorded. Ownership and relationship totals updated.'; }
  if (event.kind === 'memory') { next.memorySaved = true; next.activity = [...state.activity, event.text]; next.context = 'Saved the new purchase and the next natural follow-up.'; }
  return next;
}
export function demoTotals(state: DemoState) {
  return { purchases: DEMO_OWNED.length + Number(state.purchased), spent: DEMO_OWNED.reduce((sum, item) => sum + item.amount, 0) + (state.purchased ? DEMO_PRICE : 0) };
}
