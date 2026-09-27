// Stub for platform cut management. Will be replaced at merge.
export async function listCuts(): Promise<Array<{kind:'agency'|'clone'; id:string; name:string; cutPct:number|null}>> { return []; }
export async function setCut(target:{agencyId?:string; cloneId?:string}, pct:number|null, by:string): Promise<void> {}
export function invalidateCutCache(): void {}
export async function listAgencyCreatorCuts(agencyId:string): Promise<Array<{cloneId:string;name:string;cutPct:number|null}>> { return []; }
export async function setAgencyCreatorCut(agencyId:string, cloneId:string, pct:number|null, by:string): Promise<void> {}
