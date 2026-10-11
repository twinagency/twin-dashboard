import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { hasInternalAdminAccess } from '@/lib/internal-admin';
import { activeViewAs } from '@/lib/view-as';
import { loadBriannaLibraryMedia } from '@/lib/content-library-media';
import { creators, authoredFans } from '@/components/fans/data';
import UnifiedInbox from '@/components/inbox/UnifiedInbox';
import MovieNightDemo from '@/components/inbox/MovieNightDemo';
export const dynamic = 'force-dynamic';
export default async function InboxPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(!await hasInternalAdminAccess())redirect('/twin');
 if(await activeViewAs(await cookies()))redirect('/revenue');
 const params=await searchParams;
 if(params.presentation==='movie-night'&&(!params.creator||params.creator==='briana'))return <MovieNightDemo initialStep={typeof params.step==='string'?params.step:0} initialMode={typeof params.mode==='string'?params.mode:undefined}/>;
 let mediaItems:Awaited<ReturnType<typeof loadBriannaLibraryMedia>>=[];let mediaError=false;
 try{mediaItems=await loadBriannaLibraryMedia();}catch{mediaError=true;}
 return <UnifiedInbox creators={creators} fans={authoredFans} mediaItems={mediaItems} mediaError={mediaError}
  initialCreator={typeof params.creator==='string'?params.creator:'briana'} initialFan={typeof params.fan==='string'?params.fan:'briana-ben'} initialPlatform={typeof params.platform==='string'?params.platform:'onlyfans'} initialSource={typeof params.source==='string'?params.source:''}/>;
}
