-- ============================================================
-- عدّاد زوار مستقل لكل استبيان
-- ------------------------------------------------------------
-- كان العدّاد مفتاحاً واحداً 'visitors' تتشاركه كل الصفحات، فيظهر
-- في كل استبيان رقمُ غيره. صار لكل استبيان مفتاحه 'survey:<slug>'.
--
-- الاسم جديد عمداً كي تبقى increment_visitor_count() القديمة
-- تعمل أثناء نشر الواجهة، فلا تنكسر نافذة النشر.
--
-- التشغيل: Supabase Dashboard → SQL Editor → الصق → Run
-- ============================================================

create or replace function public.increment_visits(p_slug text default null)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_key text;
  v_val bigint;
begin
  if p_slug is null or length(trim(p_slug)) = 0 then
    v_key := 'visitors';
  else
    -- لا يُقبل إلا استبيان موجود ومرئي، منعاً لإغراق الجدول بمفاتيح عشوائية
    if not exists (
      select 1 from public.surveys
       where slug = p_slug and status in ('active', 'closed')
    ) then
      raise exception 'استبيان غير معروف' using errcode = '22023';
    end if;
    v_key := 'survey:' || p_slug;
  end if;

  insert into public.site_stats (key, value)
  values (v_key, 1)
  on conflict (key) do update
    set value = site_stats.value + 1,
        updated_at = now()
  returning value into v_val;

  return v_val;
end;
$$;

revoke all on function public.increment_visits(text) from public;
grant execute on function public.increment_visits(text) to anon, authenticated;

comment on function public.increment_visits(text) is
  'يزيد عدّاد الزوار: بلا وسيط = الموقع، وبـ slug = ذلك الاستبيان وحده';
