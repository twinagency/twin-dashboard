'use client';

import { useEffect, useState } from 'react';
import { fanAvatarUrl } from '../dashboard/fan-avatars';

export const DEMO_FAN_PHOTO_KEY = 'ronan-demo-fan-photo-v1';
export const DEMO_UPLOADED_FAN_PHOTO = '/api/dashboard/demo-fan-photo';

// One tab's presentation preference only. Never updates a real fan record.
export function useDemoFanAvatar() {
  const [uploaded, setUploaded] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { setUploaded(window.sessionStorage.getItem(DEMO_FAN_PHOTO_KEY) !== 'original'); } catch {}
    setReady(true);
    const keydown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
          target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog,[role="dialog"]')) return;
      if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        setUploaded(value => !value);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { window.sessionStorage.setItem(DEMO_FAN_PHOTO_KEY, uploaded ? 'uploaded' : 'original'); } catch {}
  }, [uploaded, ready]);

  return uploaded ? DEMO_UPLOADED_FAN_PHOTO : fanAvatarUrl('briana-ben');
}
