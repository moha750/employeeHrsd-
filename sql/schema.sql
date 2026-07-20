-- ============================================================
-- مبادرة «صديقي المهني»
-- فرع وزارة الموارد البشرية والتنمية الاجتماعية بالمنطقة الشرقية
-- مشروع الرفاه الوظيفي — بطاقة تقدير للزميل المهني
-- سكربت إنشاء قاعدة البيانات في Supabase
-- ============================================================
-- تعليمات التشغيل:
-- 1. افتح مشروعك في Supabase Dashboard
-- 2. اذهب إلى: SQL Editor
-- 3. الصق هذا السكربت بالكامل واضغط Run
-- ============================================================

-- ============================================================
-- جدول بطاقات «صديقي المهني»
-- ============================================================
create table if not exists public.friend_cards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  organization     text   not null,          -- اسم جهة العمل (إلزامي)
  sender_name      text   not null,           -- من: اسم الموظف (إلزامي)
  recipient_name   text   not null,           -- إلى: اسم الصديق المهني المُرشّح (إلزامي)
  values_selected  text[] not null,           -- القيم التي يقدّرها فيه (صفة واحدة على الأقل)
  personal_message text                        -- رسالة شخصية إضافية (اختيارية)
);

-- فهارس لتسريع لوحة الإدارة
create index if not exists friend_cards_created_at_idx
  on public.friend_cards (created_at desc);
create index if not exists friend_cards_org_idx
  on public.friend_cards (organization);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
alter table public.friend_cards enable row level security;

-- قراءة البطاقات متاحة للمستخدمين المصادَق عليهم فقط (لوحة الإدارة)
drop policy if exists "authenticated_select_friend_cards" on public.friend_cards;
create policy "authenticated_select_friend_cards"
  on public.friend_cards
  for select
  to authenticated
  using (true);

-- لا يوجد إدراج/تعديل/حذف مباشر للمجهولين.
-- الإدراج يتم حصراً عبر دالة submit_friend_card (SECURITY DEFINER) أدناه.

-- ============================================================
-- دالة الإرسال الآمنة
-- تتجاوز RLS عبر SECURITY DEFINER وتتحقق من صحة المدخلات
-- ============================================================
create or replace function public.submit_friend_card(
  p_organization     text,
  p_sender_name      text,
  p_recipient_name   text,
  p_values           text[]  default '{}',
  p_personal_message text    default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  -- القيم المسموح بها (يجب أن تطابق الواجهة)
  allowed text[] := array[
    'التعاون','الاحترام','الإنسانية','العطاء',
    'التمكين','المسؤولية','الابتكار','التميز','الالتزام'
  ];
  v text;
begin
  -- تحقق من الحقول الإلزامية
  if p_organization is null or length(trim(p_organization)) = 0 then
    raise exception 'organization is required' using errcode = '22023';
  end if;
  if p_sender_name is null or length(trim(p_sender_name)) = 0 then
    raise exception 'sender_name is required' using errcode = '22023';
  end if;
  if p_recipient_name is null or length(trim(p_recipient_name)) = 0 then
    raise exception 'recipient_name is required' using errcode = '22023';
  end if;

  -- حدود أطوال النصوص
  if length(p_organization)                        > 200  then raise exception 'organization too long'   using errcode = '22001'; end if;
  if length(p_sender_name)                         > 120  then raise exception 'sender_name too long'     using errcode = '22001'; end if;
  if length(p_recipient_name)                      > 120  then raise exception 'recipient_name too long'  using errcode = '22001'; end if;
  if length(coalesce(p_personal_message,''))       > 1000 then raise exception 'message too long'         using errcode = '22001'; end if;

  -- يجب اختيار صفة واحدة على الأقل، وبحد أقصى كل الصفات
  if array_length(p_values, 1) is null or array_length(p_values, 1) < 1 then
    raise exception 'at least one value is required' using errcode = '22023';
  end if;
  if array_length(p_values, 1) > array_length(allowed, 1) then
    raise exception 'too many values' using errcode = '22023';
  end if;

  -- تحقق من أن كل صفة ضمن القائمة المسموح بها
  foreach v in array p_values loop
    if not (v = any(allowed)) then
      raise exception 'invalid value: %', v using errcode = '22023';
    end if;
  end loop;

  insert into public.friend_cards (
    organization, sender_name, recipient_name, values_selected, personal_message
  ) values (
    trim(p_organization),
    trim(p_sender_name),
    trim(p_recipient_name),
    p_values,
    nullif(trim(coalesce(p_personal_message,'')), '')
  );
end;
$$;

grant execute on function public.submit_friend_card(text, text, text, text[], text)
  to anon, authenticated;

-- ============================================================
-- عدّاد زوّار الموقع
-- ============================================================
create table if not exists public.site_stats (
  key        text primary key,
  value      bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.site_stats enable row level security;

drop policy if exists "anon_select_site_stats" on public.site_stats;
create policy "anon_select_site_stats"
  on public.site_stats
  for select
  to anon, authenticated
  using (true);

create or replace function public.increment_visitor_count()
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_value bigint;
begin
  update public.site_stats
     set value = value + 1,
         updated_at = now()
   where key = 'visitors'
  returning value into new_value;

  if new_value is null then
    insert into public.site_stats (key, value)
    values ('visitors', 1)
    returning value into new_value;
  end if;

  return new_value;
end;
$$;

grant execute on function public.increment_visitor_count() to anon, authenticated;
