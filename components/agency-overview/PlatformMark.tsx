import React from 'react';
type Platform = 'telegram' | 'onlyfans' | 'whatsapp';

export default function PlatformMark({ platform, size = 18 }: { platform: Platform | "imessage"; size?: number }) {
  if (platform === 'imessage') return <img src="/brand/platforms/imessage.svg" alt="" aria-hidden="true" width={size} height={size} style={{ display: 'inline-block', flexShrink: 0, objectFit: 'contain' }} />;
  if (platform === 'whatsapp') return <img src="/brand/platforms/whatsapp.svg" alt="" aria-hidden="true" width={size} height={size} style={{ display: 'inline-block', flexShrink: 0, objectFit: 'contain' }} />;
  return platform === 'telegram'
    ? <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#229ed9"/><path d="m6.1 11.5 10.6-4.1c.5-.2.9.1.7 1l-1.8 8.5c-.1.6-.5.7-1 .4l-2.8-2-1.3 1.3c-.2.2-.3.3-.6.3l.2-2.9 5.3-4.8c.2-.2 0-.3-.3-.1l-6.6 4.1-2.8-.9c-.6-.2-.6-.6.4-.8Z" fill="#fff"/></svg>
    : <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d="M7.2 4.2a6.7 6.7 0 1 0 0 13.4 6.7 6.7 0 0 0 0-13.4Zm0 8.8a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2Zm4.9-7.1c2.7-.8 7.5-1 9.1-1-1.5 1.8-4.5 3.9-6.7 4.8 1.6.2 4 .9 5.2 1.6-2.2.9-5.3 1-7.2.5-.5 3-2.5 5.8-5.8 6.5 3.7-1 5.7-4.9 5.4-8.1-.1-1.4-.6-2.8-1.5-3.9.5-.1 1-.2 1.5-.3Z" fill="#00aff0"/></svg>;
}

