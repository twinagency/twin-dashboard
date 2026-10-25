import React from 'react';
import {createRoot} from 'react-dom/client';
import {usePathname} from 'next/navigation';
import DashboardAccessProvider from '@/components/DashboardAccessProvider';
import CurrencyProvider from '@/components/CurrencyProvider';
import BlurProvider from '@/components/BlurProvider';
import WorkspaceShell from '@/components/WorkspaceShell';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import MainShell from '@/components/MainShell';
import WorkspaceMobileNav from '@/components/WorkspaceMobileNav';
import MobileMenu from '@/components/MobileMenu';
import TwinWordmark from '@/components/TwinWordmark';
import {PREVIEW_CLONES} from '@/lib/onlyfans-preview/workspace';
import {UiFixturePage,configurationFixture,vaultFixture} from '../onlyfans-integration/ui-fixtures';
const channels=['all','telegram','onlyfans'] as const;
const brand=new URLSearchParams(location.search).get('brand');
const agencyName=brand==='Moxy'?'Moxy':undefined;
if(agencyName)document.documentElement.dataset.agency='moxy';
// Component review only. Every API is local synthetic data or an explicit refusal.
window.fetch=async(input,init)=>{
 const url=new URL(String(input),window.location.origin);
 if(init?.method&&init.method!=='GET')return Response.json({error:'Synthetic review does not perform writes.'},{status:403});
 const id=url.pathname.match(/\/accounts\/([^/]+)/)?.[1]||'';
 if(url.pathname.startsWith('/api/onlyfans-configuration/'))return Response.json(configurationFixture(id));
 if(url.pathname.endsWith('/vault'))return Response.json(vaultFixture(id));
 return Response.json({error:'Not connected in synthetic design review.'},{status:503});
};
function App(){const pathname=usePathname();const active=PREVIEW_CLONES[0]?.id??null;return <DashboardAccessProvider agencyName={agencyName} canManage><CurrencyProvider><BlurProvider><WorkspaceShell activeCloneId={active} creators={PREVIEW_CLONES}><Sidebar clones={PREVIEW_CLONES} activeCloneId={active} channels={[...channels]}/><div className="workspace-content flex h-screen min-w-0 flex-1 flex-col overflow-hidden"><header className="dashboard-mobile-header flex shrink-0 items-center justify-between border-b border-line px-4 py-3 lg:hidden"><TwinWordmark agencyName={agencyName}/><MobileMenu activeCloneId={active} channels={[...channels]}/></header><TopBar clones={PREVIEW_CLONES} activeCloneId={active} allTimeStars={0} creatorName="All creators" lockCreatorScope channels={[...channels]} signOut="simulated"/><MainShell showAssistant={false}>{pathname.startsWith('/onlyfans/')?<UiFixturePage key={pathname} section={pathname.split('/')[2]}/>:<div className="dashboard-page"><h1>All channels</h1><p>Shared workspace outside the OnlyFans redesign.</p></div>}</MainShell><WorkspaceMobileNav activeCloneId={active} channels={[...channels]}/></div></WorkspaceShell></BlurProvider></CurrencyProvider></DashboardAccessProvider>;}
createRoot(document.getElementById('root')!).render(<App/>);
