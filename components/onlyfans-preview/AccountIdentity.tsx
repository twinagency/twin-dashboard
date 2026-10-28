"use client";
import { useEffect } from "react";
import type { OfAccount } from "@/lib/onlyfans-preview/types";
import { useInboxIdentity } from "./InboxIdentity";
/** Populate the shell only from an account returned by the authorised read. */
export default function AccountIdentity({ account }: { account: OfAccount }) {
  const { setIdentity } = useInboxIdentity();
  const { creatorId, creatorName, handle } = account.binding;
  useEffect(() => { setIdentity({ creatorId, creatorName, handle }); return () => setIdentity(null); }, [creatorId, creatorName, handle, setIdentity]);
  return null;
}
