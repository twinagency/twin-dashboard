"use client";

import NextLink, { useLinkStatus } from "next/link";
import { useState, type ComponentProps } from "react";

function PendingNavigation() {
  const { pending } = useLinkStatus();
  return pending ? <span data-navigation-pending role="status" aria-label="Loading page" className="navigation-link-pending"><span aria-hidden="true" /></span> : null;
}

/** Keep Next's native navigation, cancellation, scroll and modified-click rules.
 * Only fully prefetch on intent; loading.tsx makes viewport prefetch lightweight. */
export default function NavigationLink({ children, prefetch, onMouseEnter, onMouseLeave, onFocus, onBlur, onTouchStart, className, ...props }: ComponentProps<typeof NextLink>) {
  const [intent, setIntent] = useState(false);
  return <NextLink {...props} className={className} data-navigation-link
    prefetch={prefetch === false ? false : intent ? true : prefetch}
    onMouseEnter={event => { onMouseEnter?.(event); setIntent(true); }}
    onMouseLeave={event => { onMouseLeave?.(event); setIntent(false); }}
    onFocus={event => { onFocus?.(event); setIntent(true); }}
    onBlur={event => { onBlur?.(event); setIntent(false); }}
    onTouchStart={event => { onTouchStart?.(event); setIntent(true); }}>
    {children}<PendingNavigation />
  </NextLink>;
}
