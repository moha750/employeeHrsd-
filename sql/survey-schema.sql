-- ============================================================
-- منصة الاستبيانات — فرع وزارة الموارد البشرية والتنمية الاجتماعية
-- بالمنطقة الشرقية | مشروع الرفاه الوظيفي
-- ============================================================
-- مخطط مدفوع بالبيانات (schema-driven): الاستبيان وأسئلته يُعرّفان
-- داخل قاعدة البيانات، فلا حاجة لتعديل الكود أو تشغيل SQL عند
-- تغيير العنوان أو الأسئلة أو بدء استبيان جديد.
--
-- تعليمات التشغيل:
--   Supabase Dashboard → SQL Editor → الصق هذا الملف بالكامل → Run
--
-- ملاحظة: هذا السكربت *لا يمس* جدول friend_cards الحالي إطلاقاً.
--         نقل بياناته يتم عبر sql/migrate-friend-cards.sql بعد ذلك.
-- ============================================================


-- ============================================================
-- 1) جدول الاستبيانات
-- ============================================================
create table if not exists public.surveys (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- المعرّف في الرابط: index.html?s=<slug>
  slug        text not null unique
              check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),

  title       text not null check (length(trim(title)) between 1 and 200),
  description text check (length(description) <= 2000),

  -- draft  = تحت الإنشاء، غير ظاهر للجمهور
  -- active = يستقبل الردود
  -- closed = مُغلق، الردود محفوظة والرابط يعرض رسالة إغلاق
  status      text not null default 'draft'
              check (status in ('draft', 'active', 'closed')),

  -- مقدمة تظهر في صندوق أعلى النموذج (تختلف عن description)
  intro       text check (length(intro) <= 5000),

  -- رسالة شاشة الشكر بعد الإرسال
  success_message text check (length(success_message) <= 1000),

  -- مظهر صفحة الاستبيان: الفاتح افتراضاً
  theme       text not null default 'light'
              check (theme in ('light', 'dark')),

  -- ميزة «البطاقة المهنية» اختيارية لكل استبيان
  card_enabled bool not null default false,
  -- يربط أدوار البطاقة بمعرّفات الأسئلة، مثال:
  -- {"recipient":"<uuid>","sender":"<uuid>","org":"<uuid>",
  --  "values":"<uuid>","message":"<uuid>"}
  card_config  jsonb not null default '{}'::jsonb
               check (jsonb_typeof(card_config) = 'object'),

  closed_at   timestamptz
);

comment on table  public.surveys is 'تعريف كل استبيان: عنوانه وحالته وإعدادات بطاقته';
comment on column public.surveys.slug   is 'معرّف الرابط — index.html?s=<slug>';
comment on column public.surveys.status is 'draft | active | closed';

create index if not exists surveys_status_created_idx
  on public.surveys (status, created_at desc);


-- ============================================================
-- 2) جدول الأسئلة
-- ============================================================
create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  survey_id   uuid not null
              references public.surveys (id) on delete cascade,

  sort_order  int  not null default 0,

  -- الأنواع المدعومة في الواجهة
  type        text not null check (type in (
                'short_text',     -- سطر واحد
                'long_text',      -- فقرة
                'single_choice',  -- اختيار واحد (radio)
                'multi_choice',   -- عدة اختيارات (checkbox / chips)
                'dropdown',       -- قائمة منسدلة
                'rating',         -- تقييم رقمي (نجوم أو أرقام)
                'date'            -- تاريخ
              )),

  label       text not null check (length(trim(label)) between 1 and 500),
  help_text   text check (length(help_text) <= 500),
  required    bool not null default true,

  -- خيارات الأسئلة الاختيارية: ["التعاون","الاحترام", ...]
  options     jsonb not null default '[]'::jsonb
              check (jsonb_typeof(options) = 'array'),

  -- إعدادات إضافية حسب النوع:
  --   short_text/long_text : {"max_length": 200}
  --   multi_choice         : {"min_select": 1, "max_select": 3}
  --   single_choice        : {"style": "chips"|"radio"}  -- شكل العرض
  --   rating               : {"min": 1, "max": 5, "style": "stars"|"numbers"}
  config      jsonb not null default '{}'::jsonb
              check (jsonb_typeof(config) = 'object'),

  -- حذف ناعم: السؤال يختفي من النموذج لكن تبقى إجاباته القديمة
  -- قابلة للقراءة والتصدير في لوحة الإدارة.
  deleted_at  timestamptz,

  -- أسئلة الاختيار لا معنى لها بلا خيارات
  constraint questions_options_required check (
    type not in ('single_choice', 'multi_choice', 'dropdown')
    or jsonb_array_length(options) > 0
  )
);

comment on table  public.questions is 'أسئلة كل استبيان — تُقرأ منها الواجهة والتحقق معاً';
comment on column public.questions.deleted_at is 'حذف ناعم: يبقي إجابات الردود القديمة قابلة للقراءة';

create index if not exists questions_survey_order_idx
  on public.questions (survey_id, sort_order);


-- ============================================================
-- 3) جدول الردود
-- ============================================================
create table if not exists public.responses (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  survey_id   uuid not null
              references public.surveys (id) on delete cascade,

  -- الإجابات مفهرسة بمعرّف السؤال: { "<question_id>": <value> }
  -- القيمة: نص | رقم | مصفوفة نصوص — حسب نوع السؤال.
  data        jsonb not null default '{}'::jsonb
              check (jsonb_typeof(data) = 'object')
);

comment on table  public.responses is 'ردود المشاركين — كل رد سجل واحد مرتبط باستبيانه';
comment on column public.responses.data is 'خريطة {question_id: value}';

create index if not exists responses_survey_created_idx
  on public.responses (survey_id, created_at desc);
create index if not exists responses_data_gin_idx
  on public.responses using gin (data);


-- ============================================================
-- 4) تحديث updated_at / closed_at تلقائياً
-- ============================================================
create or replace function public.tg_surveys_touch()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at := now();

  -- ختم لحظة الإغلاق أول مرة فقط
  if new.status = 'closed' and old.status is distinct from 'closed' then
    new.closed_at := now();
  elsif new.status <> 'closed' then
    new.closed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists surveys_touch on public.surveys;
create trigger surveys_touch
  before update on public.surveys
  for each row execute function public.tg_surveys_touch();


-- ============================================================
-- 5) Row Level Security
-- ============================================================
-- الجمهور (anon): يقرأ الاستبيانات المفتوحة وأسئلتها فقط،
--                 ولا يصل إلى الردود إطلاقاً، ولا يكتب مباشرةً.
-- الإدارة (authenticated): صلاحية كاملة على الاستبيانات والأسئلة،
--                 وقراءة الردود.
-- ============================================================

alter table public.surveys   enable row level security;
alter table public.questions enable row level security;
alter table public.responses enable row level security;

-- ---------- surveys ----------
drop policy if exists "anon_select_open_surveys" on public.surveys;
create policy "anon_select_open_surveys"
  on public.surveys for select to anon
  -- closed مسموح قراءته حتى تعرض الواجهة رسالة «انتهى الاستبيان»
  using (status in ('active', 'closed'));

drop policy if exists "admin_all_surveys" on public.surveys;
create policy "admin_all_surveys"
  on public.surveys for all to authenticated
  using (true) with check (true);

-- ---------- questions ----------
drop policy if exists "anon_select_open_questions" on public.questions;
create policy "anon_select_open_questions"
  on public.questions for select to anon
  using (
    deleted_at is null
    and exists (
      select 1 from public.surveys s
       where s.id = questions.survey_id
         and s.status in ('active', 'closed')
    )
  );

drop policy if exists "admin_all_questions" on public.questions;
create policy "admin_all_questions"
  on public.questions for all to authenticated
  using (true) with check (true);

-- ---------- responses ----------
-- لا سياسة insert لأحد: الإدراج حصراً عبر submit_response أدناه.
drop policy if exists "admin_select_responses" on public.responses;
create policy "admin_select_responses"
  on public.responses for select to authenticated
  using (true);

-- (اختياري) السماح للإدارة بحذف رد مسيء/مكرر — مفعّل عمداً بلا UPDATE
-- حتى تبقى الردود غير قابلة للتحرير:
-- drop policy if exists "admin_delete_responses" on public.responses;
-- create policy "admin_delete_responses"
--   on public.responses for delete to authenticated using (true);


-- ============================================================
-- 6) دالة الإرسال الآمنة
-- ------------------------------------------------------------
-- تتجاوز RLS عبر SECURITY DEFINER، وتتحقق من الإجابات *ديناميكياً*
-- بمطابقتها على جدول questions — فلا تحتاج إلى تعديل عند تغيير
-- الأسئلة، ويستحيل أن تفترق قواعد التحقق عن النموذج المعروض.
-- ============================================================
create or replace function public.submit_response(
  p_slug    text,
  p_answers jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_survey    public.surveys%rowtype;
  q           record;
  v_val       jsonb;
  v_blank     bool;
  v_txt       text;
  v_num       numeric;
  v_elem      text;
  v_count     int;
  v_min       numeric;
  v_max       numeric;
  v_clean     jsonb := '{}'::jsonb;
  v_known     text[] := '{}';
  v_key       text;
  v_seen      text[];
  v_id        uuid;
begin
  -- ---------- الاستبيان ----------
  select * into v_survey
    from public.surveys
   where slug = p_slug;

  if not found then
    raise exception 'الاستبيان غير موجود' using errcode = '22023';
  end if;

  if v_survey.status <> 'active' then
    raise exception 'هذا الاستبيان لا يستقبل ردوداً حالياً'
      using errcode = '22023';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'صيغة الإجابات غير صحيحة' using errcode = '22023';
  end if;

  -- ---------- التحقق سؤالاً سؤالاً ----------
  for q in
    select * from public.questions
     where survey_id = v_survey.id
       and deleted_at is null
     order by sort_order, created_at
  loop
    v_known := v_known || q.id::text;
    v_val   := p_answers -> q.id::text;

    v_blank := (
         v_val is null
      or jsonb_typeof(v_val) = 'null'
      or (jsonb_typeof(v_val) = 'string' and length(trim(v_val #>> '{}')) = 0)
      or (jsonb_typeof(v_val) = 'array'  and jsonb_array_length(v_val) = 0)
    );

    if v_blank then
      if q.required then
        raise exception 'السؤال «%» إلزامي', q.label using errcode = '22023';
      end if;
      continue;                      -- سؤال اختياري بلا إجابة: يُتجاهل
    end if;

    case q.type

      -- ===== نص قصير / فقرة =====
      when 'short_text', 'long_text' then
        if jsonb_typeof(v_val) <> 'string' then
          raise exception 'السؤال «%» يتوقع نصاً', q.label using errcode = '22023';
        end if;
        v_txt := trim(v_val #>> '{}');
        v_max := coalesce(
          (q.config ->> 'max_length')::numeric,
          case when q.type = 'short_text' then 300 else 3000 end
        );
        if length(v_txt) > v_max then
          raise exception 'إجابة السؤال «%» تتجاوز % حرفاً', q.label, v_max
            using errcode = '22001';
        end if;
        v_clean := v_clean || jsonb_build_object(q.id::text, to_jsonb(v_txt));

      -- ===== اختيار واحد / قائمة منسدلة =====
      when 'single_choice', 'dropdown' then
        if jsonb_typeof(v_val) <> 'string' then
          raise exception 'السؤال «%» يتوقع خياراً واحداً', q.label
            using errcode = '22023';
        end if;
        v_txt := v_val #>> '{}';
        if not jsonb_exists(q.options, v_txt) then
          raise exception 'خيار غير مسموح في السؤال «%»: %', q.label, v_txt
            using errcode = '22023';
        end if;
        v_clean := v_clean || jsonb_build_object(q.id::text, to_jsonb(v_txt));

      -- ===== عدة اختيارات =====
      when 'multi_choice' then
        if jsonb_typeof(v_val) <> 'array' then
          raise exception 'السؤال «%» يتوقع قائمة خيارات', q.label
            using errcode = '22023';
        end if;

        v_count := jsonb_array_length(v_val);
        v_min   := coalesce((q.config ->> 'min_select')::numeric,
                            case when q.required then 1 else 0 end);
        v_max   := coalesce((q.config ->> 'max_select')::numeric,
                            jsonb_array_length(q.options));

        if v_count < v_min then
          raise exception 'اختر % خيارات على الأقل في السؤال «%»', v_min, q.label
            using errcode = '22023';
        end if;
        if v_count > v_max then
          raise exception 'لا يمكن اختيار أكثر من % في السؤال «%»', v_max, q.label
            using errcode = '22023';
        end if;

        v_seen := '{}';
        for v_elem in select jsonb_array_elements_text(v_val) loop
          if not jsonb_exists(q.options, v_elem) then
            raise exception 'خيار غير مسموح في السؤال «%»: %', q.label, v_elem
              using errcode = '22023';
          end if;
          if v_elem = any(v_seen) then
            raise exception 'خيار مكرر في السؤال «%»: %', q.label, v_elem
              using errcode = '22023';
          end if;
          v_seen := v_seen || v_elem;
        end loop;

        v_clean := v_clean || jsonb_build_object(q.id::text, v_val);

      -- ===== تقييم رقمي =====
      when 'rating' then
        if jsonb_typeof(v_val) <> 'number' then
          raise exception 'السؤال «%» يتوقع تقييماً رقمياً', q.label
            using errcode = '22023';
        end if;
        v_num := (v_val #>> '{}')::numeric;
        v_min := coalesce((q.config ->> 'min')::numeric, 1);
        v_max := coalesce((q.config ->> 'max')::numeric, 5);

        if v_num <> trunc(v_num) then
          raise exception 'تقييم السؤال «%» يجب أن يكون عدداً صحيحاً', q.label
            using errcode = '22023';
        end if;
        if v_num < v_min or v_num > v_max then
          raise exception 'تقييم السؤال «%» خارج المدى % إلى %',
                          q.label, v_min, v_max
            using errcode = '22023';
        end if;

        v_clean := v_clean || jsonb_build_object(q.id::text, to_jsonb(v_num));

      -- ===== تاريخ =====
      when 'date' then
        if jsonb_typeof(v_val) <> 'string' then
          raise exception 'السؤال «%» يتوقع تاريخاً', q.label using errcode = '22023';
        end if;
        v_txt := trim(v_val #>> '{}');
        begin
          perform v_txt::date;
        exception when others then
          raise exception 'تاريخ غير صالح في السؤال «%»: %', q.label, v_txt
            using errcode = '22007';
        end;
        v_clean := v_clean || jsonb_build_object(
                     q.id::text, to_jsonb(to_char(v_txt::date, 'YYYY-MM-DD')));

      else
        raise exception 'نوع سؤال غير مدعوم: %', q.type using errcode = '22023';
    end case;
  end loop;

  -- ---------- رفض أي مفتاح لا يقابل سؤالاً ----------
  for v_key in select jsonb_object_keys(p_answers) loop
    if not (v_key = any(v_known)) then
      raise exception 'إجابة لسؤال غير معروف: %', v_key using errcode = '22023';
    end if;
  end loop;

  insert into public.responses (survey_id, data)
  values (v_survey.id, v_clean)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_response(text, jsonb) from public;
grant execute on function public.submit_response(text, jsonb) to anon, authenticated;

comment on function public.submit_response(text, jsonb) is
  'المدخل الوحيد لتسجيل رد — يتحقق ديناميكياً من تعريف الأسئلة';
