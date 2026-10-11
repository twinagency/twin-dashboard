'use client';

import { useMemo } from 'react';
import FanWorkspace from '../fans/FanWorkspace';
import { fanAvatarUrl } from '../dashboard/fan-avatars';
import { demoConversationHref, demoProgress, restoreDemoProgress } from './movie-night-model';
import { buildRonanProfile, RONAN_DEMO_CREATORS } from './ronan-profile-model';

export default function RonanDemoProfile({step=0,mode}:{step?:string|number;mode?:string}) {
  const state=useMemo(()=>restoreDemoProgress(step,mode),[step,mode]);
  const fans=useMemo(()=>[buildRonanProfile(state)],[state]);
  const presentation=useMemo(()=>({
    conversationHref:demoConversationHref(state),
    // Demo notes/edits cannot replace saved records in the normal fan workspace.
    storageKey:'ronan-presentation-profile-v1',
    avatarUrl:fanAvatarUrl('briana-ben'),
    query:{presentation:'movie-night',step:String(demoProgress(state)),mode:state.mode},
  }),[state]);
  return <FanWorkspace creators={RONAN_DEMO_CREATORS} fans={fans} presentation={presentation}/>;
}
