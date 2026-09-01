-- ============================================================
-- هجرة بيانات مبادرة «صديقي المهني» إلى منصة الاستبيانات
-- ============================================================
-- ينشئ استبيان «صديقي المهني» بأسئلته الخمسة، ثم ينسخ صفوف
-- friend_cards إلى responses.
--
-- ⚠️ المتطلب: تشغيل sql/survey-schema.sql أولاً.
--
-- ✔ آمن: لا يعدّل ولا يحذف شيئاً من friend_cards — نسخ فقط.
-- ✔ قابل لإعادة التشغيل: ينسخ الصفوف الجديدة فقط، فيمكن تشغيله
--   مرة الآن ومرة أخرى لحظة التحويل لالتقاط ما وصل بينهما.
-- ============================================================

-- تتبّع الأصل يمنع التكرار عند إعادة التشغيل
alter table public.responses
  add column if not exists legacy_id uuid;

create unique index if not exists responses_legacy_id_key
  on public.responses (legacy_id) where legacy_id is not null;

comment on column public.responses.legacy_id is
  'معرّف الصف الأصلي في friend_cards — للهجرة فقط، فارغ للردود الجديدة';


do $$
declare
  v_survey_id  uuid;
  q_org        uuid;
  q_sender     uuid;
  q_recipient  uuid;
  q_values     uuid;
  q_message    uuid;
  v_copied     bigint;

  -- القيم بترتيب النموذج المعروض حالياً (الالتزام رابعاً)
  c_values jsonb := '[
    "التعاون","الاحترام","الإنسانية","الالتزام","العطاء",
    "التمكين","المسؤولية","الابتكار","التميز"
  ]'::jsonb;
begin

  -- ---------- 1) الاستبيان ----------
  select id into v_survey_id from public.surveys where slug = 'friend-card';

  if v_survey_id is null then
    insert into public.surveys (
      slug, title, description, status, success_message, card_enabled
    ) values (
      'friend-card',
      'صديقي المهني',
      'وجّه رسالة تقدير إلى زميلٍ ترك في رحلتك المهنية أثرًا طيبًا — '
      || 'اختر القيم التي تقدّرها فيه، ثم حمّل بطاقته أو أرسلها عبر واتساب.',
      'active',
      'تم إنشاء بطاقتك بنجاح 💚',
      true
    )
    returning id into v_survey_id;

    raise notice 'أُنشئ الاستبيان «صديقي المهني» (%)', v_survey_id;
  else
    raise notice 'الاستبيان «صديقي المهني» موجود مسبقاً (%)', v_survey_id;
  end if;

  -- ---------- 2) الأسئلة ----------
  -- تُنشأ مرة واحدة فقط؛ إعادة التشغيل تلتقط المعرّفات الموجودة.
  select id into q_org from public.questions
   where survey_id = v_survey_id and sort_order = 1;

  if q_org is null then
    insert into public.questions
      (survey_id, sort_order, type, label, required, config)
    values
      (v_survey_id, 1, 'short_text', 'اسم جهة العمل', true,
       '{"max_length":200}'::jsonb)
    returning id into q_org;

    insert into public.questions
      (survey_id, sort_order, type, label, required, config)
    values
      (v_survey_id, 2, 'short_text', 'اسم المرسل', true,
       '{"max_length":120}'::jsonb)
    returning id into q_sender;

    insert into public.questions
      (survey_id, sort_order, type, label, required, config)
    values
      (v_survey_id, 3, 'short_text', 'المرسل إليه', true,
       '{"max_length":120}'::jsonb)
    returning id into q_recipient;

    insert into public.questions
      (survey_id, sort_order, type, label, help_text, required, options, config)
    values
      (v_survey_id, 4, 'multi_choice', 'القيمة التي أقدّرها فيك',
       'يمكنك اختيار أكثر من صفة', true, c_values,
       '{"min_select":1}'::jsonb)
    returning id into q_values;

    insert into public.questions
      (survey_id, sort_order, type, label, help_text, required, config)
    values
      (v_survey_id, 5, 'long_text', 'رسالة شخصية',
       'أضف كلماتك الخاصة لزميلك (اختياري)…', false,
       '{"max_length":1000}'::jsonb)
    returning id into q_message;

    raise notice 'أُنشئت 5 أسئلة';
  else
    select id into q_sender    from public.questions
     where survey_id = v_survey_id and sort_order = 2;
    select id into q_recipient from public.questions
     where survey_id = v_survey_id and sort_order = 3;
    select id into q_values    from public.questions
     where survey_id = v_survey_id and sort_order = 4;
    select id into q_message   from public.questions
     where survey_id = v_survey_id and sort_order = 5;

    raise notice 'الأسئلة موجودة مسبقاً';
  end if;

  -- ---------- 3) ربط أدوار البطاقة ----------
  update public.surveys
     set card_config = jsonb_build_object(
           'recipient', q_recipient::text,
           'sender',    q_sender::text,
           'org',       q_org::text,
           'values',    q_values::text,
           'message',   q_message::text
         )
   where id = v_survey_id;

  -- ---------- 4) نسخ الردود ----------
  insert into public.responses (survey_id, created_at, legacy_id, data)
  select
    v_survey_id,
    fc.created_at,
    fc.id,
    jsonb_strip_nulls(jsonb_build_object(
      q_org::text,       to_jsonb(fc.organization),
      q_sender::text,    to_jsonb(fc.sender_name),
      q_recipient::text, to_jsonb(fc.recipient_name),
      q_values::text,    to_jsonb(fc.values_selected),
      q_message::text,   to_jsonb(nullif(trim(coalesce(fc.personal_message, '')), ''))
    ))
  from public.friend_cards fc
  where not exists (
    select 1 from public.responses r where r.legacy_id = fc.id
  );

  get diagnostics v_copied = row_count;
  raise notice 'نُسخ % رداً جديداً', v_copied;

end $$;


-- ============================================================
-- تحقّق بعد التشغيل — يجب أن يتطابق العمودان
-- ============================================================
select
  (select count(*) from public.friend_cards)              as friend_cards,
  (select count(*) from public.responses r
     join public.surveys s on s.id = r.survey_id
    where s.slug = 'friend-card')                         as migrated,
  (select count(*) from public.responses r
     join public.surveys s on s.id = r.survey_id
    where s.slug = 'friend-card'
      and not (r.data ?| array(
        select id::text from public.questions
         where survey_id = s.id and sort_order = 3)))     as missing_recipient;
