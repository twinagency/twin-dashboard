-- Server-owned per-member permission. Existing partner accounts stay read-only
-- unless their agency already has management rights through the legacy policy.
ALTER TABLE public.agency_memberships
  ADD COLUMN IF NOT EXISTS can_manage boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.agency_memberships.can_manage IS
  'Set only by service-role provisioning. Grants scoped management only for supported agencies; never an internal administrator session.';
