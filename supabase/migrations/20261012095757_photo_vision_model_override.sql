-- Nullable and opt-in: existing creators and video routing retain their model.
alter table public.clones add column if not exists photo_vision_model text;
comment on column public.clones.photo_vision_model is 'Optional photo-only vision model; null inherits vision_model. Does not affect video analysis.';
