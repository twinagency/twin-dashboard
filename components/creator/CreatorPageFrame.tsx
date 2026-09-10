"use client";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import CreatorDashboardShell from "./CreatorDashboardShell";
export default function CreatorPageFrame(props: ComponentProps<typeof CreatorDashboardShell>) {
  const path = usePathname();
  if (path === "/creator/onboarding") return <>{props.children}</>;
  return <CreatorDashboardShell {...props} />;
}
