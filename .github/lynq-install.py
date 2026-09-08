from pathlib import Path
import json
root=Path('.')
def replace(path, old, new, count=None):
 p=root/path;s=p.read_text();n=s.count(old)
 assert n and (count is None or n==count),(path,n,old[:100])
 p.write_text(s.replace(old,new))
replace('lib/agency-policy.ts','import { isMoxy } from "./agency-brand";','import { isMoxy } from "./agency-brand";\nimport { AGENCY_LIVE_CRM_ROUTES } from "./agency-management-policy";')
replace('lib/agency-policy.ts','agencyName?: string): boolean {','agencyName?: string, canManage = false): boolean {')
replace('lib/agency-policy.ts','  if (isMoxy(agencyName) && path === "/api/models") return false;','  if (isMoxy(agencyName) && path === "/api/models") return false;\n  if (canManage && (Object.hasOwn(AGENCY_LIVE_CRM_ROUTES,path) || ["/api/caption","/api/compile"].includes(path))) return true;')
replace('middleware.ts','import { dashboardOrigin }','import { agencyCanManage, agencyManagementRequestAllowed } from "@/lib/agency-management-policy";\nimport { dashboardOrigin, trustedFormOrigin }')
old='''    if (req.headers.has("next-action") || !["GET", "HEAD"].includes(req.method)) return new NextResponse("Read-only agency access", {status:403});
    if (!agencyDashboardPath(pathname)) return new NextResponse("Administrator access required", {status:403});
    const identity = await agencyIdentity(agencyToken);
    if (!identity) return NextResponse.redirect(new URL(portalLoginPath(req.cookies.get(AGENCY_PORTAL_COOKIE)?.value),dashboardOrigin(req)));
    if (!agencyDashboardPath(pathname, identity.name)) return new NextResponse("Administrator access required", {status:403});'''
new='''    const identity = await agencyIdentity(agencyToken);
    if (!identity) return NextResponse.redirect(new URL(portalLoginPath(req.cookies.get(AGENCY_PORTAL_COOKIE)?.value),dashboardOrigin(req)));
    const canManage = agencyCanManage(identity);
    const serverAction = req.headers.has("next-action");
    const isWrite = serverAction || !["GET", "HEAD"].includes(req.method);
    if (isWrite && (!canManage || !agencyManagementRequestAllowed(pathname,req.method,serverAction))) return new NextResponse("Administrator access required", {status:403});
    if (isWrite && !trustedFormOrigin(req)) return new NextResponse("Untrusted request origin", {status:403});
    if (!agencyDashboardPath(pathname, identity.name, canManage)) return new NextResponse("Administrator access required", {status:403});
    // The legacy compiler GET mutates data. Agencies use its POST counterpart.
    if (pathname === "/api/compile" && !isWrite) return new NextResponse("Use POST", {status:405});'''
replace('middleware.ts',old,new)
p=root/'components/DashboardAccessProvider.tsx';s=p.read_text()
s=s.replace('const Access = createContext<{readOnly:boolean; agencyName?:string}>({readOnly:false});','const Access = createContext<{readOnly:boolean; isAgency:boolean; canManage:boolean; agencyName?:string}>({readOnly:false,isAgency:false,canManage:true});')
s=s.replace('({agencyName,children}:{agencyName?:string;children:ReactNode})','({agencyName,canManage=false,children}:{agencyName?:string;canManage?:boolean;children:ReactNode})')
s=s.replace('value={{readOnly:!!agencyName,agencyName}}','value={{readOnly:!!agencyName && !canManage,isAgency:!!agencyName,canManage:!agencyName || canManage,agencyName}}')
s=s.replace('return useDashboardAccess().readOnly ? null : <>{children}</>;','return useDashboardAccess().isAgency ? null : <>{children}</>;\n}\nexport function ManagerOnly({children}:{children:ReactNode}) {\n  return useDashboardAccess().readOnly ? null : <>{children}</>;')
s=s.replace('export function MutationForm(props:ComponentProps<"form">) {\n  return useDashboardAccess().readOnly ? null : <form {...props}/>;','export function MutationForm({adminOnly=false,...props}:ComponentProps<"form"> & {adminOnly?:boolean}) {\n  const {readOnly,isAgency}=useDashboardAccess();\n  return readOnly || (adminOnly && isAgency) ? null : <form {...props}/>;')
s=s.replace('enforce read-only access.',"enforce each agency's assigned-creator permissions.")
p.write_text(s)
replace('app/layout.tsx','<DashboardAccessProvider agencyName={agency?.name}>','<DashboardAccessProvider agencyName={agency?.name} canManage={agencyCanManage(agency)}>')
p=root/'app/layout.tsx';p.write_text('import { agencyCanManage } from "@/lib/agency-management-policy";\n'+p.read_text())
for path in ['components/TopBar.tsx','components/CloneSwitcher.tsx','components/CloneScopeForm.tsx','components/MainShell.tsx']:
 p=root/path;s=p.read_text();s=s.replace('readOnly','isAgency');p.write_text(s)
replace('components/CloneForm.tsx','{ AdminOnly, ReadOnlyEditor','{ AdminOnly, ManagerOnly, ReadOnlyEditor')
replace('components/CloneForm.tsx','        <AdminOnly>','        <ManagerOnly>',1)
replace('components/CloneForm.tsx','        </AdminOnly>','        </ManagerOnly>',1)
replace('components/CloneForm.tsx','''          <Button type="button" variant="destructive" onClick={handleDelete}>
            Delete creator
          </Button>''','''          <AdminOnly><Button type="button" variant="destructive" onClick={handleDelete}>
            Delete creator
          </Button></AdminOnly>''',1)
p=root/'app/media/MediaManager.tsx';p.write_text(p.read_text().replace('AdminOnly','ManagerOnly'))
replace('components/clone/ConfigSections.tsx','const {readOnly, agencyName}', 'const {readOnly, isAgency, agencyName}')
replace('components/clone/ConfigSections.tsx','mode === "edit" && !readOnly','mode === "edit" && !isAgency')
replace('components/clone/ConfigSections.tsx','{readOnly ? <div>','{isAgency ? <div>')
for path in ['app/users/page.tsx','app/clones/[id]/fans/[userId]/page.tsx']:
 p=root/path;s=p.read_text().replace('<MutationForm action={deleteUser}', '<MutationForm adminOnly action={deleteUser}').replace('<MutationForm action={clearMinorFlag}','<MutationForm adminOnly action={clearMinorFlag}');p.write_text(s)
replace('components/Sidebar.tsx','const {readOnly,agencyName}', 'const {readOnly,isAgency,canManage,agencyName}')
replace('components/Sidebar.tsx','if (readOnly && link.kind === "route" && !agencyDashboardPath(link.href, agencyName)) {','if (isAgency && link.kind === "route" && !agencyDashboardPath(link.href, agencyName, canManage)) {\n      if (!showUnavailable) return null;')
replace('components/Sidebar.tsx',': readOnly ? <div className="px-7 py-4 text-sm text-white/75">{agencyName} · Read only</div>',': isAgency ? <div className="px-7 py-4 text-sm text-white/75">{agencyName} · {readOnly ? "Read only" : "Creator management"}</div>')
replace('components/Sidebar.tsx','!readOnly || showUnavailable || link.kind === "tab" || agencyDashboardPath(link.href)','!isAgency || showUnavailable || link.kind === "tab" || agencyDashboardPath(link.href, agencyName, canManage)')
replace('components/Sidebar.tsx','showAssistant && !readOnly','showAssistant && !isAgency')
for page,destination in [('fans','/users'),('inbox','/users'),('campaigns','/flows'),('platforms','/business')]:
 p=root/f'app/crm/{page}/page.tsx';s=p.read_text();s='import { getDashboardAccess } from "@/lib/dashboard-access";\nimport { agencyCanManage } from "@/lib/agency-management-policy";\nimport { redirect } from "next/navigation";\n'+s
 s=s.replace('export default function','export default async function').replace('  return <CrmPreview',f'  if (agencyCanManage(await getDashboardAccess())) redirect("{destination}");\n  return <CrmPreview');p.write_text(s)
replace('app/clones/actions.ts','import { revalidatePath }','import { getDashboardAccess } from "@/lib/dashboard-access";\nimport { AGENCY_PROTECTED_CLONE_FIELDS } from "@/lib/agency-write";\nimport { revalidatePath }')
replace('app/clones/actions.ts','  const row = rowFromForm(fd);\n  if (row.bot_token)', '  const row = rowFromForm(fd);\n  if (await getDashboardAccess()) {\n    for (const key of AGENCY_PROTECTED_CLONE_FIELDS) delete (row as Record<string, unknown>)[key];\n  }\n  if (row.bot_token)')
p=root/'app/api/compile/route.ts';p.write_text('''import { NextRequest, NextResponse } from "next/server";
import { compileClone } from "@/lib/compiler";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { requireManagedClone } from "@/lib/agency-management";
import { trustedFormOrigin } from "@/lib/form-origin";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  if (await getDashboardAccess()) return NextResponse.json({error:"Use POST"},{status:405});
  const id=req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({error:"missing id"},{status:400});
  try { return NextResponse.json(await compileClone(id)); }
  catch { return NextResponse.json({error:"Compilation failed"},{status:500}); }
}
export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return NextResponse.json({error:"Untrusted request origin"},{status:403});
  try {
    const body=await req.json();
    await requireManagedClone(body.id);
    if (typeof body.id!=="string" || !body.id) return NextResponse.json({error:"missing id"},{status:400});
    return NextResponse.json(await compileClone(body.id));
  } catch { return NextResponse.json({error:"Creator access or compilation unavailable"},{status:403}); }
}
''')
for path in ['app/api/caption/route.ts','app/api/business-account/route.ts']:
 p=root/path;s=p.read_text();s='import { requireManagedClone } from "@/lib/agency-management";\nimport { trustedFormOrigin } from "@/lib/form-origin";\n'+s
 s=s.replace('export async function POST(req: NextRequest) {','export async function POST(req: NextRequest) {\n  if (!trustedFormOrigin(req)) return NextResponse.json({error:"Untrusted request origin"},{status:403});')
 if 'caption/' in path:
  s=s.replace('  if (!file) return', '  try { await requireManagedClone(cloneId); } catch { return NextResponse.json({error:"Creator access denied"},{status:403}); }\n  if (!file) return')
 else:
  s=s.replace('    const action = String(form.get("action") ?? "");','    const action = String(form.get("action") ?? "");\n    try { await requireManagedClone(cloneId); } catch { return NextResponse.json({error:"Creator access denied"},{status:403}); }')
 p.write_text(s)
p=root/'components/CompileButton.tsx';s=p.read_text();old='fetch(`/api/compile?id=${cloneId}`)';assert old in s;s=s.replace(old,'fetch("/api/compile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: cloneId }) })');p.write_text(s)
p=root/'app/clones/page.tsx';s=p.read_text();s='import { AdminOnly } from "@/components/DashboardAccessProvider";\n'+s;s=s.replace('<Button nativeButton={false} render={<Link href="/clones/new" />}>Create the first creator</Button>','<AdminOnly><Button nativeButton={false} render={<Link href="/clones/new" />}>Create the first creator</Button></AdminOnly>');p.write_text(s)
p=root/'package.json';j=json.loads(p.read_text());j['scripts']['test:agency']+=' && tsx scripts/check-lynq-management.tsx';p.write_text(json.dumps(j,indent=2)+'\n')
