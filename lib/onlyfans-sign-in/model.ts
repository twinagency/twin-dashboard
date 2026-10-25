/** Public sign-in state only. Provider credentials never belong in this model. */
export type SignInAttempt = {
  id: string;
  phase: 'opening' | 'waiting' | 'ready' | 'submitted' | 'cancelled' | 'expired' | 'failed' | 'wrong_account';
  handle: string | null;
  expiresAt: string;
  enrollmentId: string | null;
  width: number;
  height: number;
  keyboard?: 'email' | 'password' | 'text' | null;
};

export function parseSignInAttempt(value: unknown): SignInAttempt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as SignInAttempt;
  const uuid = (id: unknown) => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
  if (Object.keys(v).some(key => !['id', 'phase', 'handle', 'expiresAt', 'enrollmentId', 'width', 'height', 'keyboard'].includes(key))) return null;
  if (!uuid(v.id) || !['opening', 'waiting', 'ready', 'submitted', 'cancelled', 'expired', 'failed', 'wrong_account'].includes(v.phase)) return null;
  if (v.handle !== null && (typeof v.handle !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(v.handle))) return null;
  if (typeof v.expiresAt !== 'string' || !Number.isFinite(Date.parse(v.expiresAt)) || (v.enrollmentId !== null && !uuid(v.enrollmentId))) return null;
  if (v.width !== 432 || v.height !== 720 || (v.keyboard !== undefined && v.keyboard !== null && !['email', 'password', 'text'].includes(v.keyboard))) return null;
  return v;
}

export function currentSignInAttempt(attempt: SignInAttempt, now = Date.now()): SignInAttempt {
  // Enrollment has its own durable lifetime once submitted to the native service.
  return ['opening', 'waiting', 'ready'].includes(attempt.phase) && Date.parse(attempt.expiresAt) <= now
    ? { ...attempt, phase: 'expired', keyboard: null }
    : attempt;
}
