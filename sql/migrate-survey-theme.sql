-- ============================================================
-- إضافة سمة المظهر لكل استبيان
-- ------------------------------------------------------------
-- الوضع الفاتح هو الافتراضي للموقع كله، وهذا الحقل يسمح
-- بجعل صفحة استبيان بعينها داكنة دون أن يتأثر سواها.
--
-- التشغيل: Supabase Dashboard → SQL Editor → الصق → Run
-- آمن للتكرار: لا يفعل شيئاً إن كان العمود موجوداً.
-- ============================================================

alter table public.surveys
  add column if not exists theme text not null default 'light';

-- قيد القيم المسموحة، يُضاف مرة واحدة فقط
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'surveys_theme_check'
       and conrelid = 'public.surveys'::regclass
  ) then
    alter table public.surveys
      add constraint surveys_theme_check check (theme in ('light', 'dark'));
  end if;
end $$;

comment on column public.surveys.theme is
  'مظهر صفحة الاستبيان: light (الافتراضي) | dark';
