const fs=require('fs'),path=require('path'),ts=require('typescript');
const root=process.cwd();
function walk(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())walk(p);else if(p.endsWith('.ts')){
 const s=fs.readFileSync(p,'utf8');if(!/^[\'"]use server[\'"]/.test(s))continue;
 const rel=path.relative(root,p);const ast=ts.createSourceFile(p,s,ts.ScriptTarget.Latest,true);const edits=[];
 for(const st of ast.statements){if(ts.isFunctionDeclaration(st)&&st.body&&st.name&&st.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)){
  if(st.parameters.some(p=>!ts.isIdentifier(p.name)))throw new Error('Destructured server action parameters require explicit handling');
  const args=st.parameters.map(p=>p.name.text).join(', ');
  edits.push([st.body.getStart(ast)+1,`\n  await guardDashboardAction(${JSON.stringify(rel+'#'+st.name.text)}, [${args}]);`]);
 }}
 let out=s;for(const [i,t] of edits.sort((a,b)=>b[0]-a[0]))out=out.slice(0,i)+t+out.slice(i);
 out=out.replace(/^("use server";|'use server';)/,'$1\n\nimport { guardDashboardAction } from "@/lib/agency-management";');fs.writeFileSync(p,out);console.log(rel,edits.length);
}}}walk(path.join(root,'app'));
