import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MoxyControls from '../../components/onlyfans-launch/automation/MoxyControls';
function App(){const [selected,setSelected]=useState<boolean|null>(null);const [account,setAccount]=useState('fixture-a');
return <main className="mx-auto max-w-3xl p-4"><p className="mb-4 font-semibold">FIXTURE ONLY · No customer connection</p>
<button onClick={()=>setAccount(account==='fixture-a'?'fixture-b':'fixture-a')}>Switch fixture account</button>
<MoxyControls accountId={account} manage={true} goHold={null} onOwnership={setSelected}/><p data-owner>{String(selected)}</p></main>}
createRoot(document.getElementById('root')!).render(<App/>);
