-- Organização em projeto/pasta e data programada de postagem de cada carrossel.
alter table public.carousels
  add column project text not null default '' check (char_length(project) <= 60),
  add column folder text not null default '' check (char_length(folder) <= 60),
  add column scheduled_for date;

create index carousels_schedule_idx on public.carousels (user_id, scheduled_for) where scheduled_for is not null;
