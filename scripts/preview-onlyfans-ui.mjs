/** Isolated UI review, synthetic fixtures only; never enables live account access. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,'..');
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'dev',path.join(root,'preview/onlyfans-integration'),'--hostname','0.0.0.0','--port',process.env.PORT||'4173'],{cwd:root,stdio:'inherit',env:{...process.env,ONLYFANS_UI_FIXTURE:'1'}});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
