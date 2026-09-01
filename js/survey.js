// ============================================================
// عارض الاستبيانات الديناميكي
// يبني النموذج من جدولي surveys / questions، ويتحقق من الإجابات
// بنفس قواعد دالة submit_response قبل إرسالها.
// ============================================================

(function () {
  'use strict';

  // ===== التحقق من إعدادات Supabase =====
  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || config.url.includes('YOUR_PROJECT_ID')) {
    document.getElementById('survey-state-text').textContent =
      'لم يتم إعداد الاتصال بقاعدة البيانات. يرجى إعداد ملف js/config.js';
    document.getElementById('survey-state').classList.add('is-error');
    return;
  }

  const supabase = window.supabase.createClient(config.url, config.anonKey);

  // ===== عناصر DOM =====
  const stateCard      = document.getElementById('survey-state');
  const stateText      = document.getElementById('survey-state-text');
  const formCard       = document.getElementById('form-card');
  const form           = document.getElementById('survey-form');
  const questionsRoot  = document.getElementById('questions-root');
  const submitBtn      = document.getElementById('submit-btn');
  const alertContainer = document.getElementById('alert-container');
  const successCard    = document.getElementById('success-card');
  const successTitle   = document.getElementById('success-title');
  const successText    = document.getElementById('success-text');
  const newResponseBtn = document.getElementById('new-response-btn');
  const titleEl        = document.getElementById('campaign-title');
  const taglineEl      = document.getElementById('campaign-tagline');

  // ===== الحالة =====
  let survey    = null;
  let questions = [];

  // أيقونة علامة الاختيار داخل الـ chip
  const CHECK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" ' +
    'stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  // الحدود الافتراضية — يجب أن تطابق submit_response
  const DEFAULT_MAX_LENGTH = { short_text: 300, long_text: 3000 };


  // ============================================================
  // أدوات مساعدة
  // ============================================================
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function showState(message, isError) {
    stateText.textContent = message;
    stateCard.classList.toggle('is-error', !!isError);
    stateCard.hidden = false;
    formCard.hidden = true;
    successCard.hidden = true;
  }

  function hideState() {
    stateCard.hidden = true;
  }

  function showAlert(type, message) {
    alertContainer.innerHTML =
      '<div class="alert alert-' + type + '">' +
      '<span>' + (type === 'error' ? '⚠️' : '✓') + '</span>' +
      '<span>' + escapeHtml(message) + '</span></div>';
    alertContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearAlert() {
    alertContainer.innerHTML = '';
  }

  // يستخدمه js/card.js لعرض رسائل التحميل والمشاركة
  window.surveyToast = function (message, type) { showToast(message, type); };

  function showToast(message, type) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast' + (type === 'error' ? ' toast--error' : ' toast--success');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const icon = type === 'error'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

    toast.innerHTML = icon + '<span>' + escapeHtml(message) + '</span>';
    document.body.appendChild(toast);
    void toast.offsetWidth;
    toast.classList.add('is-visible');

    setTimeout(() => {
      toast.classList.remove('is-visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 2600);
  }


  // ============================================================
  // ترويسة الصفحة
  // ============================================================
  function renderHeader() {
    // إبراز الكلمة الأخيرة من العنوان بلون التمييز — كما في التصميم الأصلي
    const words = survey.title.trim().split(/\s+/);
    const last  = words.pop();
    titleEl.innerHTML =
      (words.length ? escapeHtml(words.join(' ')) + ' ' : '') +
      '<span class="accent">' + escapeHtml(last) + '</span>';

    titleEl.hidden = false;

    taglineEl.textContent = survey.description || '';
    taglineEl.hidden = !survey.description;

    document.title = survey.title +
      ' — فرع وزارة الموارد البشرية والتنمية الاجتماعية بالمنطقة الشرقية';
  }


  // ============================================================
  // بناء الأسئلة
  // ============================================================
  function buildLabel(q, index, forId) {
    const tag  = forId ? 'label' : 'div';
    const attr = forId ? ' for="' + forId + '"' : '';
    const mark = q.required
      ? '<span class="required">*</span>'
      : '<span class="optional">(اختياري)</span>';

    return '<' + tag + ' class="form-label" id="lbl-' + q.id + '"' + attr + '>' +
             '<span class="question-number">' + index + '</span>' +
             escapeHtml(q.label) + ' ' + mark +
           '</' + tag + '>' +
           (q.help_text
             ? '<p class="form-hint">' + escapeHtml(q.help_text) + '</p>'
             : '');
  }

  function buildChips(q, inputType) {
    const chips = q.options.map((opt, i) => {
      const id = 'q-' + q.id + '-' + i;
      return '<label class="value-chip">' +
               '<input type="' + inputType + '" id="' + id + '" ' +
                      'name="q-' + q.id + '" value="' + escapeHtml(opt) + '">' +
               '<span class="value-chip__check" aria-hidden="true">' + CHECK_SVG + '</span>' +
               '<span class="value-chip__label">' + escapeHtml(opt) + '</span>' +
             '</label>';
    }).join('');

    return '<div class="value-chips" id="ctl-' + q.id + '" role="group" ' +
                'aria-labelledby="lbl-' + q.id + '">' + chips + '</div>';
  }

  function buildRating(q) {
    const min = num(q.config.min, 1);
    const max = num(q.config.max, 5);

    let opts = '';
    for (let v = min; v <= max; v++) {
      opts += '<label class="rating-option">' +
                '<input type="radio" name="q-' + q.id + '" value="' + v + '">' +
                '<span class="rating-option__num">' + v + '</span>' +
              '</label>';
    }

    const ends = (q.config.min_label || q.config.max_label)
      ? '<div class="rating-scale__ends">' +
          '<span>' + escapeHtml(q.config.min_label || '') + '</span>' +
          '<span>' + escapeHtml(q.config.max_label || '') + '</span>' +
        '</div>'
      : '';

    return '<div id="ctl-' + q.id + '" role="group" aria-labelledby="lbl-' + q.id + '">' +
             '<div class="rating-scale">' + opts + '</div>' + ends +
           '</div>';
  }

  function buildControl(q) {
    const id  = 'q-' + q.id;
    const max = num(q.config.max_length, DEFAULT_MAX_LENGTH[q.type]);

    switch (q.type) {
      case 'short_text':
        return '<input type="text" id="' + id + '" class="form-input" ' +
                      'maxlength="' + max + '" autocomplete="off">';

      case 'long_text':
        return '<textarea id="' + id + '" class="form-input form-textarea" ' +
                         'rows="3" maxlength="' + max + '"></textarea>';

      case 'date':
        return '<input type="date" id="' + id + '" class="form-input">';

      case 'dropdown':
        return '<select id="' + id + '" class="form-input form-select">' +
                 '<option value="">اختر…</option>' +
                 q.options.map(o =>
                   '<option value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</option>'
                 ).join('') +
               '</select>';

      case 'single_choice': return buildChips(q, 'radio');
      case 'multi_choice':  return buildChips(q, 'checkbox');
      case 'rating':        return buildRating(q);

      default:
        return '';
    }
  }

  function renderQuestions() {
    // الأسئلة ذات الحقل الواحد تربط الـ label بالحقل مباشرةً
    const SINGLE_CONTROL = ['short_text', 'long_text', 'date', 'dropdown'];

    questionsRoot.innerHTML = questions.map((q, i) => {
      const forId = SINGLE_CONTROL.includes(q.type) ? 'q-' + q.id : null;
      return '<div class="form-group" data-qid="' + q.id + '" data-type="' + q.type + '">' +
               buildLabel(q, i + 1, forId) +
               buildControl(q) +
             '</div>';
    }).join('');
  }


  // ============================================================
  // قراءة الإجابات
  // ============================================================
  // تُعيد null إذا كانت الإجابة فارغة — بنفس تعريف «الفراغ» في الخادم.
  function readAnswer(q) {
    const root = questionsRoot.querySelector('[data-qid="' + q.id + '"]');
    if (!root) return null;

    switch (q.type) {
      case 'short_text':
      case 'long_text': {
        const v = root.querySelector('#q-' + q.id).value.trim();
        return v === '' ? null : v;
      }

      case 'date': {
        const v = root.querySelector('#q-' + q.id).value;
        return v === '' ? null : v;
      }

      case 'dropdown': {
        const v = root.querySelector('#q-' + q.id).value;
        return v === '' ? null : v;
      }

      case 'single_choice': {
        const el = root.querySelector('input:checked');
        return el ? el.value : null;
      }

      case 'multi_choice': {
        const list = Array.from(root.querySelectorAll('input:checked')).map(el => el.value);
        return list.length ? list : null;
      }

      case 'rating': {
        const el = root.querySelector('input:checked');
        return el ? Number(el.value) : null;
      }

      default:
        return null;
    }
  }


  // ============================================================
  // التحقق — يعكس قواعد submit_response حرفياً
  // ============================================================
  function clearInvalid() {
    questionsRoot.querySelectorAll('.is-invalid')
      .forEach(el => el.classList.remove('is-invalid'));
  }

  function markInvalid(q) {
    const root = questionsRoot.querySelector('[data-qid="' + q.id + '"]');
    if (!root) return null;

    // مجموعات الاختيار تُعلَّم على الحاوية، والحقول المفردة على .form-group
    const chips = root.querySelector('.value-chips');
    (chips || root).classList.add('is-invalid');
    return chips || root;
  }

  function validate() {
    clearInvalid();

    for (const q of questions) {
      const value = readAnswer(q);

      if (value === null) {
        if (q.required) {
          return { ok: false, message: 'السؤال «' + q.label + '» إلزامي', focus: markInvalid(q) };
        }
        continue;
      }

      if (q.type === 'short_text' || q.type === 'long_text') {
        const max = num(q.config.max_length, DEFAULT_MAX_LENGTH[q.type]);
        if (value.length > max) {
          return {
            ok: false,
            message: 'إجابة السؤال «' + q.label + '» تتجاوز ' + max + ' حرفاً',
            focus: markInvalid(q)
          };
        }
      }

      if (q.type === 'multi_choice') {
        const min = num(q.config.min_select, q.required ? 1 : 0);
        const max = num(q.config.max_select, q.options.length);
        if (value.length < min) {
          return {
            ok: false,
            message: 'اختر ' + min + ' خيارات على الأقل في السؤال «' + q.label + '»',
            focus: markInvalid(q)
          };
        }
        if (value.length > max) {
          return {
            ok: false,
            message: 'لا يمكن اختيار أكثر من ' + max + ' في السؤال «' + q.label + '»',
            focus: markInvalid(q)
          };
        }
      }

      if (q.type === 'rating') {
        const min = num(q.config.min, 1);
        const max = num(q.config.max, 5);
        if (value < min || value > max) {
          return {
            ok: false,
            message: 'تقييم السؤال «' + q.label + '» خارج المدى ' + min + ' إلى ' + max,
            focus: markInvalid(q)
          };
        }
      }

      if (q.type === 'date' && Number.isNaN(Date.parse(value))) {
        return {
          ok: false,
          message: 'تاريخ غير صالح في السؤال «' + q.label + '»',
          focus: markInvalid(q)
        };
      }
    }

    return { ok: true };
  }

  // إزالة علامة الخطأ فور تفاعل المستخدم
  function onInteract(e) {
    const group = e.target.closest('.form-group');
    if (!group) return;
    group.classList.remove('is-invalid');
    const chips = group.querySelector('.value-chips');
    if (chips) chips.classList.remove('is-invalid');
  }
  form.addEventListener('input',  onInteract);
  form.addEventListener('change', onInteract);


  // ============================================================
  // الإرسال
  // ============================================================
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();

    const result = validate();
    if (!result.ok) {
      showAlert('error', result.message);
      if (result.focus) {
        result.focus.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const first = result.focus.querySelector('input, textarea, select') || result.focus;
        try { first.focus({ preventScroll: true }); } catch (_) {}
      }
      return;
    }

    // بناء حمولة الإجابات — الفارغة تُحذف تماماً
    const answers = {};
    questions.forEach(q => {
      const v = readAnswer(q);
      if (v !== null) answers[q.id] = v;
    });

    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = 'جاري الإرسال…';

    try {
      const { error } = await supabase.rpc('submit_response', {
        p_slug:    survey.slug,
        p_answers: answers
      });
      if (error) throw error;

      showSuccess(answers);

    } catch (err) {
      console.error('تعذر إرسال الاستبيان:', err);
      // رسائل الدالة عربية ومفهومة — تُعرض كما هي عند توفرها
      showAlert('error', err && err.message
        ? err.message
        : 'تعذر إرسال إجابتك. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.');
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });


  // ============================================================
  // شاشة الشكر
  // ============================================================
  function showSuccess(answers) {
    successTitle.textContent = 'شكرًا لمشاركتك';
    successText.textContent  = survey.success_message || 'تم استلام إجابتك بنجاح.';

    // البطاقة الاختيارية
    let cardShown = false;
    if (survey.card_enabled && typeof window.renderSurveyCard === 'function') {
      try {
        cardShown = window.renderSurveyCard(survey, questions, answers) === true;
      } catch (err) {
        console.warn('تعذر بناء البطاقة:', err);
      }
    }
    if (!cardShown && typeof window.hideSurveyCard === 'function') {
      window.hideSurveyCard();
    }

    formCard.hidden    = true;
    successCard.hidden = false;
    successCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  newResponseBtn.addEventListener('click', () => {
    if (typeof window.hideSurveyCard === 'function') window.hideSurveyCard();
    successCard.hidden = true;
    formCard.hidden    = false;
    form.reset();
    clearAlert();
    clearInvalid();
    submitBtn.disabled = false;
    submitBtn.textContent = 'إرسال';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });


  // ============================================================
  // التحميل
  // ============================================================
  async function load() {
    const slug = new URLSearchParams(window.location.search).get('s');

    try {
      // (1) الاستبيان: بالمعرّف إن وُجد، وإلا أحدث استبيان مفتوح
      let query = supabase.from('surveys').select('*');
      query = slug
        ? query.eq('slug', slug)
        : query.eq('status', 'active').order('created_at', { ascending: false });

      const { data: rows, error: sErr } = await query.limit(1);
      if (sErr) throw sErr;

      if (!rows || rows.length === 0) {
        showState(slug
          ? 'لم يُعثر على هذا الاستبيان. تأكد من صحة الرابط.'
          : 'لا يوجد استبيان مفتوح حالياً.', true);
        return;
      }

      survey = rows[0];
      renderHeader();

      if (survey.status !== 'active') {
        showState('انتهى هذا الاستبيان ولم يعد يستقبل إجابات. شكرًا لاهتمامك.', false);
        return;
      }

      // (2) الأسئلة
      const { data: qs, error: qErr } = await supabase
        .from('questions')
        .select('*')
        .eq('survey_id', survey.id)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (qErr) throw qErr;

      questions = (qs || []).map(q => ({
        ...q,
        options: Array.isArray(q.options) ? q.options : [],
        config:  (q.config && typeof q.config === 'object') ? q.config : {}
      }));

      if (questions.length === 0) {
        showState('هذا الاستبيان لا يحتوي على أسئلة بعد.', true);
        return;
      }

      renderQuestions();
      hideState();
      formCard.hidden = false;

    } catch (err) {
      console.error('تعذر تحميل الاستبيان:', err);
      showState('تعذر تحميل الاستبيان. يرجى التحقق من اتصال الإنترنت وإعادة المحاولة.', true);
    }
  }

  load();

})();
