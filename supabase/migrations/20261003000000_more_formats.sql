-- Proporções novas: 3:4 (grade do perfil do Instagram / foto vertical do TikTok) e 1:1 (quadrado).
alter table public.carousels
  drop constraint if exists carousels_format_check,
  add constraint carousels_format_check check (format in ('4:5', '3:4', '1:1', '9:16'));
