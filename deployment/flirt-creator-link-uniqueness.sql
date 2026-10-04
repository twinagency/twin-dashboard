-- Existing creator links are preserved; a bot cannot be assigned twice.
-- Twin bots use a slug because their UUID is not a local clone foreign key.
CREATE UNIQUE INDEX IF NOT EXISTS creator_clone_links_twin_slug_key
  ON public.creator_clone_links (twin_slug)
  WHERE twin_slug IS NOT NULL;
