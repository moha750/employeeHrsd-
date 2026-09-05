-- ============================================================
-- مقدمة الاستبيان
-- ------------------------------------------------------------
-- نص يظهر في صندوق مميّز أعلى النموذج، على غرار «مقدمة المبادرة»
-- في الصفحة الرئيسية. يختلف عن description الذي يبقى سطراً
-- رصاصياً تحت العنوان.
--
-- التشغيل: Supabase Dashboard → SQL Editor → الصق → Run
-- آمن للتكرار.
-- ============================================================

alter table public.surveys
  add column if not exists intro text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'surveys_intro_len_check'
       and conrelid = 'public.surveys'::regclass
  ) then
    alter table public.surveys
      add constraint surveys_intro_len_check check (length(intro) <= 5000);
  end if;
end $$;

comment on column public.surveys.intro is
  'مقدمة تظهر في صندوق أعلى النموذج — تختلف عن description (سطر تحت العنوان)';
