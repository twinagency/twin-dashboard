-- Existing bank accounts remain valid until a recipient address is added.
alter table public.creator_bank_details
  add column if not exists recipient_address jsonb
    check (recipient_address is null or jsonb_typeof(recipient_address) = 'object');

notify pgrst, 'reload schema';
