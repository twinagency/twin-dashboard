"use client";
import { usePathname } from "next/navigation";
import { useDashboardAccess } from "./DashboardAccessProvider";
import { setCloneScope } from "@/app/actions/clone-scope";
import type { ReactNode } from "react";
export default function CloneScopeForm({cloneId,children,className}:{cloneId:string|null;children:ReactNode;className?:string}) {
  const {readOnly}=useDashboardAccess();const pathname=usePathname();
  if (readOnly) return <form method="post" action="/agency/clone-scope" className={className}><input type="hidden" name="clone" value={cloneId??""}/><input type="hidden" name="next" value={pathname}/>{children}</form>;
  return <form action={setCloneScope.bind(null,cloneId)} className={className}>{children}</form>;
}
