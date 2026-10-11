// Presentation fixtures only. Never sent to a platform or persisted to the CRM.
export const MOVIE_DEMO_HREF = '/inbox?creator=briana&platform=onlyfans&presentation=movie-night';
// Preserve the existing OnlyFans demo price; no Telegram Stars conversion is implied.
export const DEMO_PRICE = 18;
export type DemoMessage = { id: string; role: 'fan' | 'creator' | 'system'; text: string; offer?: boolean; manual?: boolean };
export const DEMO_HISTORY: DemoMessage[] = [
  {
    "id": "history-work",
    "role": "system",
    "text": "Earlier context: Ronan may need to stay back at work tonight."
  },
  {
    "id": "history-video",
    "role": "system",
    "text": "Previous purchase: Shower video, last week."
  }
];
export const DEMO_MEMORIES = [
  {
    "id": "work",
    "label": "Earlier work plans",
    "value": "Ronan may need to stay back tonight.",
    "source": "history-work"
  },
  {
    "id": "video",
    "label": "Previous purchase",
    "value": "Shower video purchased last week.",
    "source": "history-video"
  }
];
export const DEMO_OWNED = [
  {
    "id": "outdoor",
    "title": "Outdoor moments",
    "amount": 29
  },
  {
    "id": "shower",
    "title": "Shower video",
    "amount": 29
  },
  {
    "id": "coffee",
    "title": "Coffee break diary",
    "amount": 24
  },
  {
    "id": "weekend",
    "title": "Weekend notes",
    "amount": 44
  }
];
type Event = { kind: 'fan' | 'creator' | 'context' | 'offer' | 'purchase' | 'memory'; text: string; delay: number };
export type DemoScene = { title: string; cue: string; memories: string[]; events: Event[] };
// Dialogue supplied by the owner. Do not generate or embellish these messages.
export const DEMO_SCENES: DemoScene[] = [
  {
    "title": "After the late shift",
    "cue": "Show the earlier work plan before Bri asks whether he stayed back.",
    "memories": [
      "work"
    ],
    "events": [
      {
        "kind": "fan",
        "text": "you still awake?",
        "delay": 1800
      },
      {
        "kind": "context",
        "text": "Retrieved the earlier work plan from this demo’s prepared history.",
        "delay": 2500
      },
      {
        "kind": "creator",
        "text": "always for you baby. did you end up staying back?",
        "delay": 3300
      },
      {
        "kind": "fan",
        "text": "just walked in the door. i'm wrecked yeah James had to leave so I covered",
        "delay": 4200
      },
      {
        "kind": "creator",
        "text": "aww my poor baby. come lie down and talk to me, i'll make you feel better 🥺",
        "delay": 4700
      },
      {
        "kind": "fan",
        "text": "you always do",
        "delay": 2200
      }
    ]
  },
  {
    "title": "A remembered purchase",
    "cue": "Open the prior purchase record to show where the video reference comes from.",
    "memories": [
      "video"
    ],
    "events": [
      {
        "kind": "context",
        "text": "Retrieved last week’s video purchase from the prepared fan record.",
        "delay": 2200
      },
      {
        "kind": "creator",
        "text": "did you ever end up rewatching that shower video from last week? 🙈",
        "delay": 3600
      },
      {
        "kind": "fan",
        "text": "more than once if i'm honest lol that shit crazy",
        "delay": 3000
      },
      {
        "kind": "creator",
        "text": "hehe i knew it. i was thinking about you while i filmed it",
        "delay": 3500
      }
    ]
  },
  {
    "title": "The conversation develops",
    "cue": "Let the supplied exchange play through at a comfortable reading pace.",
    "memories": [
      "work",
      "video"
    ],
    "events": [
      {
        "kind": "fan",
        "text": "don't say that, i'm already getting hard",
        "delay": 2500
      },
      {
        "kind": "creator",
        "text": "good. you deserve a reward after tonight. i'd climb on top of you and slowly sink down onto your cock",
        "delay": 5800
      },
      {
        "kind": "fan",
        "text": "fuck yes, my hands on your hips",
        "delay": 2200
      },
      {
        "kind": "creator",
        "text": "you still think about me riding you, don't you? 😏",
        "delay": 3000
      },
      {
        "kind": "fan",
        "text": "every single night baby",
        "delay": 2200
      },
      {
        "kind": "creator",
        "text": "mmm i'd ride you slow and deep until you can't hold it anymore",
        "delay": 3600
      },
      {
        "kind": "fan",
        "text": "you're killing me right now",
        "delay": 2200
      }
    ]
  },
  {
    "title": "The paid offer",
    "cue": "Show his request, the prepared content card and the ownership check.",
    "memories": [
      "video"
    ],
    "events": [
      {
        "kind": "creator",
        "text": "want to see what i look like on top, from your view? 😈",
        "delay": 3500
      },
      {
        "kind": "fan",
        "text": "yes. please. show me",
        "delay": 2200
      },
      {
        "kind": "context",
        "text": "Checked four prior demo purchases. Private photo is not already owned.",
        "delay": 2000
      },
      {
        "kind": "offer",
        "text": "this is exactly what you'd be looking up at baby 😘",
        "delay": 3200
      }
    ]
  },
  {
    "title": "Purchase and follow-up",
    "cue": "Pause on the purchase update, then continue to Bri’s final reply.",
    "memories": [
      "work",
      "video"
    ],
    "events": [
      {
        "kind": "purchase",
        "text": "Private photo unlocked. US$18.00 added to this demo relationship.",
        "delay": 3500
      },
      {
        "kind": "creator",
        "text": "now get some sleep, you earned it. dream about me 🥰",
        "delay": 3500
      },
      {
        "kind": "memory",
        "text": "Ronan covered for James and came home tired. Private photo purchased. Follow up after he has rested.",
        "delay": 1800
      }
    ]
  }
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
  if (event.kind === 'offer' && !state.offered) { next.offered = true; next.messages = [...state.messages, { id, role: 'creator', text: event.text, offer: true }]; next.activity = [...state.activity, 'Private photo offered for US$18.00. Awaiting simulated purchase.']; }
  if (event.kind === 'purchase' && state.offered && !state.purchased) { next.purchased = true; next.messages = [...state.messages, { id, role: 'system', text: 'Purchased Private photo · US$18.00' }]; next.activity = [...state.activity, event.text]; next.context = 'Purchase recorded. Ownership and relationship totals updated.'; }
  if (event.kind === 'memory') { next.memorySaved = true; next.activity = [...state.activity, event.text]; next.context = 'Saved the new purchase and the next natural follow-up.'; }
  return next;
}
export function demoTotals(state: DemoState) {
  return { purchases: DEMO_OWNED.length + Number(state.purchased), spent: DEMO_OWNED.reduce((sum, item) => sum + item.amount, 0) + (state.purchased ? DEMO_PRICE : 0) };
}

// A bounded script checkpoint travels with the profile link. Restoring never
// starts playback, charges money, or reads/writes a live fan record.
export const DEMO_EVENT_COUNT = DEMO_SCENES.reduce((sum, scene) => sum + scene.events.length, 0);
export const demoProgress = (state: DemoState) => state.scene < 0 ? 0 : DEMO_SCENES.slice(0, state.scene).reduce((sum, scene) => sum + scene.events.length, 0) + state.cursor;
export function restoreDemoProgress(step: unknown, mode?: unknown): DemoState {
  const value = typeof step === 'string' || typeof step === 'number' ? Number(step) : 0;
  const count = Number.isFinite(value) ? Math.max(0, Math.min(DEMO_EVENT_COUNT, Math.floor(value))) : 0;
  let state = newMovieDemo();
  for (let index = 0; index < count; index++) {
    if (!state.playing) state = movieDemoReducer(state, { type: 'start', auto: true });
    state = movieDemoReducer(state, { type: 'tick' });
  }
  return { ...state, playing: false, auto: false, mode: mode === 'Human' ? 'Human' : 'Autonomous' };
}
export const demoConversationHref = (state: DemoState) => `${MOVIE_DEMO_HREF}&step=${demoProgress(state)}&mode=${state.mode}`;
export const demoProfileHref = (state: DemoState) => `/fans?${new URLSearchParams({creator:'briana',fan:'briana-ronan-demo',platform:'onlyfans',presentation:'movie-night',step:String(demoProgress(state)),mode:state.mode})}`;
