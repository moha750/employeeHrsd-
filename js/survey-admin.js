// ============================================================
// باني الاستبيانات — إنشاء الاستبيانات وتحرير أسئلتها
// كل التغييرات تُحفظ في قاعدة البيانات، فلا حاجة لتعديل الكود.
// ============================================================

(function () {
  'use strict';

  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || config.url.includes('YOUR_PROJECT_ID')) {
    alert('لم يتم إعداد الاتصال بقاعدة البيانات (js/config.js)');
    return;
  }
  const supabase = window.supabase.createClient(config.url, config.anonKey);

  // ===== أنواع الأسئلة =====
  const TYPES = {
    short_text:    'نص قصير',
    long_text:     'فقرة',
    single_choice: 'اختيار واحد',
    multi_choice:  'عدة اختيارات',
    dropdown:      'قائمة منسدلة',
    rating:        'تقييم رقمي',
    date:          'تاريخ'
  };
  const CHOICE_TYPES = ['single_choice', 'multi_choice', 'dropdown'];
  const TEXT_TYPES   = ['short_text', 'long_text'];

  const STATUS = {
    draft:  { label: 'مسودّة', cls: 'sv-badge--draft'  },
    active: { label: 'مفتوح',  cls: 'sv-badge--active' },
    closed: { label: 'مغلق',   cls: 'sv-badge--closed' }
  };

  // ===== عناصر DOM =====
  const $ = id => document.getElementById(id);
  const loginSection = $('login-section');
  const dashboard    = $('dashboard-section');
  const loginForm    = $('login-form');
  const loginAlert   = $('login-alert');
  const loginBtn     = $('login-btn');
  const logoutBtn    = $('logout-btn');
  const alertBox     = $('sv-alert');
  const viewHeading  = $('view-heading');

  const surveysView  = $('surveys-view');
  const surveysList  = $('surveys-list');
  const surveysCount = $('surveys-count');
  const newBtn       = $('new-survey-btn');

  const editorView   = $('editor-view');
  const editorMeta   = $('editor-meta');
  const editorWarn   = $('editor-warn');
  const backBtn      = $('back-btn');
  const saveBtn      = $('save-btn');
  const addQBtn      = $('add-question-btn');
  const qList        = $('questions-list');

  const fTitle   = $('sv-title');
  const fSlug    = $('sv-slug');
  const fDesc    = $('sv-desc');
  const fSuccess = $('sv-success');
  const fStatus  = $('sv-status');
  const fTheme   = $('sv-theme');
  const linkPrev = $('sv-link-preview');

  const cardToggle = $('sv-card-enabled');
  const cardFields = $('sv-card-fields');
  // الأدوار وأنواع الأسئلة الصالحة لكل دور
  const CARD_ROLES = {
    recipient: ['short_text', 'long_text', 'single_choice', 'dropdown'],
    sender:    ['short_text', 'long_text', 'single_choice', 'dropdown'],
    org:       ['short_text', 'long_text', 'single_choice', 'dropdown'],
    values:    ['multi_choice', 'single_choice', 'dropdown'],
    message:   ['long_text', 'short_text']
  };
  const CARD_TEXTS = ['ribbon', 'headline', 'body', 'to_label',
                      'from_label', 'values_label', 'share_text'];

  // ===== الحالة =====
  const state = {
    surveys:      [],
    survey:       null,   // الاستبيان قيد التحرير (null = جديد)
    questions:    [],     // { id?, type, label, help_text, required, options[], config{} }
    originalIds:  [],     // معرّفات الأسئلة وقت التحميل — لكشف المحذوف
    responseCount: 0,
    slugTouched:  false
  };


  // ============================================================
  // أدوات
  // ============================================================
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function notify(type, message) {
    alertBox.innerHTML =
      '<div class="alert alert-' + type + '">' +
      '<span>' + (type === 'error' ? '⚠️' : '✓') + '</span>' +
      '<span>' + esc(message) + '</span></div>';
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (type === 'success') setTimeout(() => { alertBox.innerHTML = ''; }, 4000);
  }

  function clearNotice() { alertBox.innerHTML = ''; }

  function publicLink(slug) {
    return new URL('survey.html?s=' + encodeURIComponent(slug), window.location.href).href;
  }

  // نقل حرفي عربي → لاتيني، ليكون معرّف الرابط مقروءاً لا عشوائياً
  const AR_LATIN = {
    'ا':'a','أ':'a','إ':'i','آ':'a','ٱ':'a','ى':'a','ء':'',
    'ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh',
    'د':'d','ذ':'dh','ر':'r','ز':'z','س':'s','ش':'sh',
    'ص':'s','ض':'d','ط':'t','ظ':'z','ع':'a','غ':'gh',
    'ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n',
    'ه':'h','ة':'h','و':'w','ؤ':'w','ي':'y','ئ':'y',
    '٠':'0','١':'1','٢':'2','٣':'3','٤':'4',
    '٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'
  };

  function transliterate(text) {
    return String(text || '')
      .replace(/[\u064B-\u0652\u0640]/g, '')            // تشكيل وتطويل
      .split('')
      .map(ch => (ch in AR_LATIN) ? AR_LATIN[ch] : ch)
      .join('');
  }

  // توليد معرّف رابط من العنوان
  function slugify(text) {
    const base = transliterate(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60)
      .replace(/-$/, '');
    return /^[a-z0-9]/.test(base) && base.length >= 2
      ? base
      : ('survey-' + Date.now().toString(36).slice(-6));
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ar-SA',
      { year: 'numeric', month: 'long', day: 'numeric' });
  }


  // ============================================================
  // المصادقة
  // ============================================================
  (async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) { showDashboard(); await loadSurveys(); }
  })();

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginAlert.innerHTML = '';
    loginBtn.disabled = true;
    loginBtn.textContent = 'جاري الدخول…';

    const { error } = await supabase.auth.signInWithPassword({
      email:    $('email').value.trim(),
      password: $('password').value
    });

    if (error) {
      loginAlert.innerHTML =
        '<div class="alert alert-error"><span>⚠️</span>' +
        '<span>البريد الإلكتروني أو كلمة السر غير صحيحة</span></div>';
      loginBtn.disabled = false;
      loginBtn.textContent = 'دخول';
      return;
    }

    showDashboard();
    await loadSurveys();
  });

  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    dashboard.style.display = 'none';
    loginSection.style.display = '';
    document.body.classList.add('is-locked');
    loginForm.reset();
    loginBtn.disabled = false;
    loginBtn.textContent = 'دخول';
  });

  function showDashboard() {
    loginSection.style.display = 'none';
    dashboard.style.display = '';
    document.body.classList.remove('is-locked');
    document.body.style.overflow = '';
    document.querySelector('.sticky-bar')?.classList.remove('is-visible');
  }


  // ============================================================
  // قائمة الاستبيانات
  // ============================================================
  async function loadSurveys() {
    surveysList.innerHTML = '<div class="loading">جارٍ التحميل…</div>';
    try {
      const { data: surveys, error } = await supabase
        .from('surveys').select('*').order('created_at', { ascending: false });
      if (error) throw error;

      // عدد الردود والأسئلة لكل استبيان
      const counts = {};
      await Promise.all((surveys || []).map(async (s) => {
        const [{ count: r }, { count: q }] = await Promise.all([
          supabase.from('responses').select('id', { count: 'exact', head: true })
                  .eq('survey_id', s.id),
          supabase.from('questions').select('id', { count: 'exact', head: true })
                  .eq('survey_id', s.id).is('deleted_at', null)
        ]);
        counts[s.id] = { responses: r || 0, questions: q || 0 };
      }));

      state.surveys = (surveys || []).map(s => ({ ...s, counts: counts[s.id] }));
      renderSurveys();
    } catch (err) {
      console.error(err);
      surveysList.innerHTML = '<div class="sv-empty">تعذّر تحميل الاستبيانات.</div>';
    }
  }

  function renderSurveys() {
    surveysCount.textContent = state.surveys.length
      ? state.surveys.length + ' استبيان' : '';

    if (!state.surveys.length) {
      surveysList.innerHTML =
        '<div class="sv-empty">لا توجد استبيانات بعد. ابدأ بإنشاء واحد.</div>';
      return;
    }

    surveysList.innerHTML = state.surveys.map(s => {
      const st = STATUS[s.status] || STATUS.draft;
      return '<article class="sv-card" data-id="' + s.id + '">' +
        '<div class="sv-card__top">' +
          '<span class="sv-badge ' + st.cls + '">' + st.label + '</span>' +
          '<span class="sv-card__slug" dir="ltr">' + esc(s.slug) + '</span>' +
        '</div>' +
        '<h3 class="sv-card__title">' + esc(s.title) + '</h3>' +
        '<p class="sv-card__desc">' + esc(s.description || '') + '</p>' +
        '<div class="sv-card__stats">' +
          '<span><strong>' + s.counts.questions + '</strong> سؤال</span>' +
          '<span><strong>' + s.counts.responses.toLocaleString('ar-SA') + '</strong> رد</span>' +
          '<span>' + fmtDate(s.created_at) + '</span>' +
        '</div>' +
        '<div class="sv-card__actions">' +
          '<button type="button" data-act="edit">تحرير</button>' +
          '<button type="button" data-act="link">نسخ الرابط</button>' +
          '<button type="button" data-act="dup">تكرار</button>' +
          '<button type="button" data-act="del" class="is-danger">حذف</button>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  surveysList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.sv-card').dataset.id;
    const s  = state.surveys.find(x => x.id === id);
    if (!s) return;

    switch (btn.dataset.act) {
      case 'edit': return openEditor(s.id);
      case 'link': return copyLink(s.slug);
      case 'dup':  return duplicateSurvey(s);
      case 'del':  return deleteSurvey(s);
    }
  });

  async function copyLink(slug) {
    const url = publicLink(slug);
    try {
      await navigator.clipboard.writeText(url);
      notify('success', 'نُسخ الرابط: ' + url);
    } catch (_) {
      window.prompt('انسخ الرابط:', url);
    }
  }

  async function duplicateSurvey(s) {
    if (!window.confirm('تكرار «' + s.title + '» كمسودّة جديدة بأسئلته نفسها؟')) return;
    clearNotice();
    try {
      const { data: qs, error: qErr } = await supabase
        .from('questions').select('*')
        .eq('survey_id', s.id).is('deleted_at', null)
        .order('sort_order');
      if (qErr) throw qErr;

      let slug = slugify(s.slug + '-2');
      const taken = new Set(state.surveys.map(x => x.slug));
      let n = 2;
      while (taken.has(slug)) { n++; slug = slugify(s.slug + '-' + n); }

      const { data: created, error: sErr } = await supabase.from('surveys').insert({
        slug,
        title:           s.title + ' (نسخة)',
        description:     s.description,
        success_message: s.success_message,
        theme:           s.theme === 'dark' ? 'dark' : 'light',
        status:          'draft'
      }).select().single();
      if (sErr) throw sErr;

      if (qs && qs.length) {
        const { error: iErr } = await supabase.from('questions').insert(
          qs.map((q, i) => ({
            survey_id:  created.id,
            sort_order: i + 1,
            type:       q.type,
            label:      q.label,
            help_text:  q.help_text,
            required:   q.required,
            options:    q.options,
            config:     q.config
          }))
        );
        if (iErr) throw iErr;
      }

      await loadSurveys();
      notify('success', 'أُنشئت نسخة كمسودّة. حرّرها ثم افتحها للجمهور.');
    } catch (err) {
      console.error(err);
      notify('error', 'تعذّر التكرار: ' + (err.message || ''));
    }
  }

  async function deleteSurvey(s) {
    const n = s.counts.responses;
    const warning = n > 0
      ? 'سيُحذف الاستبيان «' + s.title + '» مع ' + n.toLocaleString('ar-SA') +
        ' رداً حذفاً نهائياً لا يمكن التراجع عنه.\n\n' +
        'إن كنت تريد إيقافه فقط مع الاحتفاظ بالردود، اختر «إلغاء» ثم غيّر حالته إلى «مغلق».'
      : 'سيُحذف الاستبيان «' + s.title + '» (لا ردود عليه).';

    if (!window.confirm(warning)) return;
    if (n > 0 && window.prompt('للتأكيد، اكتب: حذف') !== 'حذف') {
      notify('error', 'أُلغي الحذف.');
      return;
    }

    try {
      const { error } = await supabase.from('surveys').delete().eq('id', s.id);
      if (error) throw error;
      await loadSurveys();
      notify('success', 'حُذف الاستبيان.');
    } catch (err) {
      console.error(err);
      notify('error', 'تعذّر الحذف: ' + (err.message || ''));
    }
  }


  // ============================================================
  // تبديل العرض
  // ============================================================
  function showView(name) {
    const isEditor = name === 'editor';
    surveysView.hidden = isEditor;
    editorView.hidden  = !isEditor;
    viewHeading.textContent = isEditor ? 'محرّر الاستبيان' : 'الاستبيانات';
    clearNotice();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  backBtn.addEventListener('click', async () => {
    showView('list');
    await loadSurveys();
  });

  newBtn.addEventListener('click', () => openEditor(null));


  // ============================================================
  // المحرّر
  // ============================================================
  async function openEditor(id) {
    state.survey        = null;
    state.questions     = [];
    state.originalIds   = [];
    state.responseCount = 0;
    state.slugTouched   = !!id;

    if (!id) {
      fTitle.value = ''; fSlug.value = ''; fDesc.value = '';
      fSuccess.value = ''; fStatus.value = 'draft'; fTheme.value = 'light';
      editorMeta.textContent = 'استبيان جديد';
      editorWarn.hidden = true;
      renderQuestions();
      loadCardConfig(null);
      updateLinkPreview();
      showView('editor');
      fTitle.focus();
      return;
    }

    try {
      const [{ data: s, error: sErr }, { data: qs, error: qErr }, { count }] =
        await Promise.all([
          supabase.from('surveys').select('*').eq('id', id).single(),
          supabase.from('questions').select('*')
                  .eq('survey_id', id).is('deleted_at', null).order('sort_order'),
          supabase.from('responses').select('id', { count: 'exact', head: true })
                  .eq('survey_id', id)
        ]);
      if (sErr) throw sErr;
      if (qErr) throw qErr;

      state.survey        = s;
      state.responseCount = count || 0;
      state.questions     = (qs || []).map(q => ({
        id:        q.id,
        type:      q.type,
        label:     q.label,
        help_text: q.help_text || '',
        required:  q.required,
        options:   Array.isArray(q.options) ? q.options.slice() : [],
        config:    (q.config && typeof q.config === 'object') ? { ...q.config } : {}
      }));
      state.originalIds = state.questions.map(q => q.id);

      fTitle.value   = s.title;
      fSlug.value    = s.slug;
      fDesc.value    = s.description || '';
      fSuccess.value = s.success_message || '';
      fStatus.value  = s.status;
      fTheme.value   = s.theme === 'dark' ? 'dark' : 'light';

      editorMeta.textContent =
        state.responseCount.toLocaleString('ar-SA') + ' رد · أُنشئ ' + fmtDate(s.created_at);

      if (state.responseCount > 0) {
        editorWarn.hidden = false;
        editorWarn.innerHTML =
          '<strong>تنبيه:</strong> على هذا الاستبيان ' +
          state.responseCount.toLocaleString('ar-SA') +
          ' رداً. تغيير نوع سؤال أو حذف خيار قد يجعل الردود القديمة غير مفهومة. ' +
          'للاستبيان الجديد استخدم زر <em>تكرار</em> من القائمة بدل التعديل هنا.';
      } else {
        editorWarn.hidden = true;
      }

      renderQuestions();
      loadCardConfig(s);
      updateLinkPreview();
      showView('editor');
    } catch (err) {
      console.error(err);
      notify('error', 'تعذّر فتح الاستبيان: ' + (err.message || ''));
    }
  }

  // معرّف الرابط يتولّد من العنوان ما لم يحرّره المستخدم يدوياً
  fTitle.addEventListener('input', () => {
    if (!state.slugTouched) {
      fSlug.value = slugify(fTitle.value);
      updateLinkPreview();
    }
  });
  fSlug.addEventListener('input', () => {
    state.slugTouched = true;
    updateLinkPreview();
  });

  // ============================================================
  // لوحة البطاقة
  // ============================================================
  cardToggle.addEventListener('change', () => {
    cardFields.hidden = !cardToggle.checked;
    if (cardToggle.checked) renderCardRoles();
  });

  // قوائم الأدوار تُبنى من الأسئلة الحالية (بعد مزامنتها من الـ DOM)
  function renderCardRoles() {
    syncFromDom();
    Object.keys(CARD_ROLES).forEach(role => {
      const sel = document.querySelector('[data-role="' + role + '"]');
      if (!sel) return;
      const prev = sel.value;
      const allowed = CARD_ROLES[role];
      sel.innerHTML = '<option value="">— بلا ربط —</option>' +
        state.questions
          .filter(q => q.id && allowed.includes(q.type))
          .map(q => '<option value="' + q.id + '">' +
                    esc(q.label || 'سؤال بلا نص') + ' (' + TYPES[q.type] + ')</option>')
          .join('');
      // الأسئلة الجديدة غير المحفوظة لا معرّف لها بعد
      const unsaved = state.questions.filter(q => !q.id && allowed.includes(q.type)).length;
      if (unsaved) {
        sel.insertAdjacentHTML('beforeend',
          '<option value="" disabled>(' + unsaved + ' سؤال جديد — احفظ أولاً ليظهر)</option>');
      }
      if (prev && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
    });
  }

  function loadCardConfig(survey) {
    const cfg = (survey && survey.card_config && typeof survey.card_config === 'object')
      ? survey.card_config : {};

    cardToggle.checked = !!(survey && survey.card_enabled);
    cardFields.hidden  = !cardToggle.checked;

    renderCardRoles();
    Object.keys(CARD_ROLES).forEach(role => {
      const sel = document.querySelector('[data-role="' + role + '"]');
      if (!sel) return;
      const want = cfg[role] || '';
      sel.value = sel.querySelector('option[value="' + want + '"]') ? want : '';
    });

    CARD_TEXTS.forEach(key => {
      const el = document.querySelector('[data-text="' + key + '"]');
      if (el) el.value = cfg[key] || '';
    });
  }

  // يبني card_config محافظاً على أي مفاتيح لا تديرها هذه الواجهة
  function readCardConfig() {
    const base = (state.survey && state.survey.card_config &&
                  typeof state.survey.card_config === 'object')
      ? { ...state.survey.card_config } : {};

    Object.keys(CARD_ROLES).forEach(role => {
      const sel = document.querySelector('[data-role="' + role + '"]');
      const v = sel ? sel.value.trim() : '';
      if (v) base[role] = v; else delete base[role];
    });

    CARD_TEXTS.forEach(key => {
      const el = document.querySelector('[data-text="' + key + '"]');
      const v = el ? el.value.trim() : '';
      if (v) base[key] = v; else delete base[key];
    });

    return base;
  }

  function updateLinkPreview() {
    const slug = fSlug.value.trim();
    linkPrev.textContent = slug ? publicLink(slug) : '—';
  }


  // ============================================================
  // محرّر الأسئلة
  // ============================================================
  function blankQuestion() {
    return { type: 'short_text', label: '', help_text: '', required: true,
             options: [], config: {} };
  }

  addQBtn.addEventListener('click', () => {
    syncFromDom();
    state.questions.push(blankQuestion());
    renderQuestions(state.questions.length - 1);
    if (cardToggle.checked) renderCardRoles();
  });

  function renderQuestions(openIdx) {
    if (!state.questions.length) {
      qList.innerHTML = '<div class="sv-empty">لا توجد أسئلة. اضغط «إضافة سؤال».</div>';
      return;
    }

    qList.innerHTML = state.questions.map((q, i) =>
      '<div class="q-item" data-idx="' + i + '">' +
        '<div class="q-item__head">' +
          '<span class="q-item__num">' + (i + 1) + '</span>' +
          '<span class="q-item__label">' +
            (q.label ? esc(q.label) : '<em>سؤال بلا نص</em>') + '</span>' +
          '<span class="q-item__type">' + TYPES[q.type] + '</span>' +
          '<span class="q-item__actions">' +
            '<button type="button" data-act="up"     title="أعلى"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button type="button" data-act="down"   title="أسفل"' + (i === state.questions.length - 1 ? ' disabled' : '') + '>↓</button>' +
            '<button type="button" data-act="toggle" title="تحرير">تحرير</button>' +
            '<button type="button" data-act="del" class="is-danger" title="حذف">حذف</button>' +
          '</span>' +
        '</div>' +
        '<div class="q-item__body"' + (i === openIdx ? '' : ' hidden') + '>' +
          questionFields(q, i) +
        '</div>' +
      '</div>'
    ).join('');
  }

  function questionFields(q, i) {
    const typeOpts = Object.keys(TYPES).map(t =>
      '<option value="' + t + '"' + (t === q.type ? ' selected' : '') + '>' +
      TYPES[t] + '</option>').join('');

    let extra = '';

    if (CHOICE_TYPES.includes(q.type)) {
      extra +=
        '<div class="form-group">' +
          '<label class="form-label" for="q-opts-' + i + '">الخيارات <span class="required">*</span></label>' +
          '<textarea id="q-opts-' + i + '" class="form-input form-textarea" rows="4" ' +
                    'data-f="options" placeholder="خيار في كل سطر">' +
            esc(q.options.join('\n')) +
          '</textarea>' +
          '<p class="form-hint">اكتب خياراً واحداً في كل سطر.</p>' +
        '</div>';
    }

    if (q.type === 'single_choice') {
      extra +=
        '<div class="q-row">' +
          selField('شكل العرض', 'style', q.config.style, i, [
            ['chips', 'شرائح — الافتراضي'],
            ['radio', 'أزرار راديو']
          ]) +
        '</div>';
    }

    if (q.type === 'multi_choice') {
      extra +=
        '<div class="q-row">' +
          numField('الحد الأدنى للاختيارات', 'min_select', q.config.min_select, i) +
          numField('الحد الأقصى للاختيارات', 'max_select', q.config.max_select, i) +
        '</div>';
    }

    if (TEXT_TYPES.includes(q.type)) {
      extra += '<div class="q-row">' +
        numField('أقصى عدد أحرف', 'max_length', q.config.max_length, i) + '</div>';
    }

    if (q.type === 'rating') {
      extra +=
        '<div class="q-row">' +
          numField('أقل قيمة', 'min', q.config.min, i) +
          numField('أعلى قيمة', 'max', q.config.max, i) +
        '</div>' +
        '<div class="q-row">' +
          txtField('وصف الأقل', 'min_label', q.config.min_label, i) +
          txtField('وصف الأعلى', 'max_label', q.config.max_label, i) +
        '</div>';
    }

    return '' +
      '<div class="form-group">' +
        '<label class="form-label" for="q-label-' + i + '">نص السؤال <span class="required">*</span></label>' +
        '<input type="text" id="q-label-' + i + '" class="form-input" data-f="label" ' +
               'maxlength="500" value="' + esc(q.label) + '">' +
      '</div>' +
      '<div class="q-row">' +
        '<div class="form-group">' +
          '<label class="form-label" for="q-type-' + i + '">النوع</label>' +
          '<select id="q-type-' + i + '" class="form-input form-select" data-f="type">' +
            typeOpts + '</select>' +
        '</div>' +
        '<div class="form-group q-required">' +
          '<label class="q-check">' +
            '<input type="checkbox" data-f="required"' + (q.required ? ' checked' : '') + '>' +
            '<span>سؤال إلزامي</span>' +
          '</label>' +
        '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label" for="q-help-' + i + '">نص مساعد <span class="optional">(اختياري)</span></label>' +
        '<input type="text" id="q-help-' + i + '" class="form-input" data-f="help_text" ' +
               'maxlength="500" value="' + esc(q.help_text) + '">' +
      '</div>' +
      extra;
  }

  function numField(label, key, value, i) {
    return '<div class="form-group">' +
      '<label class="form-label" for="q-' + key + '-' + i + '">' + label + '</label>' +
      '<input type="number" id="q-' + key + '-' + i + '" class="form-input" ' +
             'data-c="' + key + '" value="' + (value === undefined || value === null ? '' : esc(value)) + '">' +
    '</div>';
  }

  function selField(label, key, value, i, opts) {
    const cur = value || opts[0][0];
    return '<div class="form-group">' +
      '<label class="form-label" for="q-' + key + '-' + i + '">' + label + '</label>' +
      '<select id="q-' + key + '-' + i + '" class="form-input form-select" data-c="' + key + '">' +
        opts.map(o => '<option value="' + o[0] + '"' +
                      (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') +
      '</select>' +
    '</div>';
  }

  function txtField(label, key, value, i) {
    return '<div class="form-group">' +
      '<label class="form-label" for="q-' + key + '-' + i + '">' + label + '</label>' +
      '<input type="text" id="q-' + key + '-' + i + '" class="form-input" maxlength="60" ' +
             'data-c="' + key + '" value="' + esc(value || '') + '">' +
    '</div>';
  }

  // قراءة كل الأسئلة من الـ DOM إلى الحالة (قبل أي إعادة رسم)
  function syncFromDom() {
    qList.querySelectorAll('.q-item').forEach(item => {
      const i = Number(item.dataset.idx);
      const q = state.questions[i];
      if (!q) return;

      item.querySelectorAll('[data-f]').forEach(el => {
        const f = el.dataset.f;
        if (f === 'required')      q.required = el.checked;
        else if (f === 'options')  q.options  = el.value.split('\n')
                                     .map(s => s.trim()).filter(Boolean);
        else                       q[f] = el.value;
      });

      const cfg = {};
      item.querySelectorAll('[data-c]').forEach(el => {
        const v = el.value.trim();
        if (v === '') return;
        cfg[el.dataset.c] = el.type === 'number' ? Number(v) : v;
      });
      q.config = cfg;
    });
  }

  qList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const item = btn.closest('.q-item');
    const i = Number(item.dataset.idx);

    if (btn.dataset.act === 'toggle') {
      const body = item.querySelector('.q-item__body');
      body.hidden = !body.hidden;
      return;
    }

    syncFromDom();

    if (btn.dataset.act === 'del') {
      if (!window.confirm('حذف السؤال «' + (state.questions[i].label || 'بلا نص') + '»؟')) return;
      state.questions.splice(i, 1);
      renderQuestions();
    } else if (btn.dataset.act === 'up' && i > 0) {
      [state.questions[i - 1], state.questions[i]] = [state.questions[i], state.questions[i - 1]];
      renderQuestions(i - 1);
    } else if (btn.dataset.act === 'down' && i < state.questions.length - 1) {
      [state.questions[i], state.questions[i + 1]] = [state.questions[i + 1], state.questions[i]];
      renderQuestions(i + 1);
    }
  });

  // تغيير النوع يعيد بناء الحقول الخاصة به
  qList.addEventListener('change', (e) => {
    if (e.target.dataset.f !== 'type') return;
    const i = Number(e.target.closest('.q-item').dataset.idx);
    syncFromDom();
    state.questions[i].config  = {};
    if (!CHOICE_TYPES.includes(state.questions[i].type)) state.questions[i].options = [];
    renderQuestions(i);
  });

  // تحديث العنوان في رأس السؤال أثناء الكتابة
  qList.addEventListener('input', (e) => {
    if (e.target.dataset.f !== 'label') return;
    const item = e.target.closest('.q-item');
    item.querySelector('.q-item__label').innerHTML =
      e.target.value ? esc(e.target.value) : '<em>سؤال بلا نص</em>';
  });


  // ============================================================
  // التحقق والحفظ
  // ============================================================
  function validate() {
    const title = fTitle.value.trim();
    const slug  = fSlug.value.trim();

    if (!title) return 'عنوان الاستبيان إلزامي';
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug))
      return 'معرّف الرابط يجب أن يبدأ بحرف إنجليزي صغير أو رقم، ويحتوي على حروف صغيرة وأرقام وشرطات فقط (٢–٦٣ خانة)';
    if (!state.questions.length) return 'أضف سؤالاً واحداً على الأقل';

    for (let i = 0; i < state.questions.length; i++) {
      const q = state.questions[i];
      const n = 'السؤال ' + (i + 1);

      if (!q.label.trim()) return n + ': نص السؤال إلزامي';

      if (CHOICE_TYPES.includes(q.type)) {
        if (!q.options.length) return n + ': أضف خياراً واحداً على الأقل';
        if (new Set(q.options).size !== q.options.length)
          return n + ': توجد خيارات مكرّرة';
      }

      if (q.type === 'multi_choice') {
        const mn = q.config.min_select, mx = q.config.max_select;
        if (mx !== undefined && mx > q.options.length)
          return n + ': الحد الأقصى للاختيارات أكبر من عدد الخيارات';
        if (mn !== undefined && mx !== undefined && mn > mx)
          return n + ': الحد الأدنى أكبر من الحد الأقصى';
      }

      if (q.type === 'rating') {
        const mn = q.config.min ?? 1, mx = q.config.max ?? 5;
        if (!Number.isInteger(mn) || !Number.isInteger(mx))
          return n + ': حدود التقييم يجب أن تكون أعداداً صحيحة';
        if (mn >= mx) return n + ': أقل قيمة يجب أن تكون أصغر من أعلى قيمة';
        if (mx - mn > 20) return n + ': مدى التقييم واسع جداً (بحد أقصى ٢١ درجة)';
      }

      if (TEXT_TYPES.includes(q.type) && q.config.max_length !== undefined) {
        const L = q.config.max_length;
        const cap = q.type === 'short_text' ? 300 : 3000;
        if (!Number.isInteger(L) || L < 1 || L > cap)
          return n + ': أقصى عدد أحرف يجب أن يكون بين ١ و' + cap;
      }
    }
    return null;
  }

  saveBtn.addEventListener('click', async () => {
    syncFromDom();
    clearNotice();

    const problem = validate();
    if (problem) { notify('error', problem); return; }

    saveBtn.disabled = true;
    const original = saveBtn.textContent;
    saveBtn.textContent = 'جاري الحفظ…';

    try {
      const meta = {
        slug:            fSlug.value.trim(),
        title:           fTitle.value.trim(),
        description:     fDesc.value.trim() || null,
        success_message: fSuccess.value.trim() || null,
        status:          fStatus.value,
        theme:           fTheme.value === 'dark' ? 'dark' : 'light',
        card_enabled:    cardToggle.checked,
        card_config:     readCardConfig()
      };

      // (1) الاستبيان
      let surveyId;
      if (state.survey) {
        const { error } = await supabase.from('surveys')
          .update(meta).eq('id', state.survey.id);
        if (error) throw error;
        surveyId = state.survey.id;
      } else {
        const { data, error } = await supabase.from('surveys')
          .insert(meta).select('id').single();
        if (error) throw error;
        surveyId = data.id;
      }

      // (2) الأسئلة المحذوفة: حذف ناعم إن كانت هناك ردود، وإلا حذف نهائي
      const keptIds  = state.questions.filter(q => q.id).map(q => q.id);
      const removed  = state.originalIds.filter(id => !keptIds.includes(id));
      if (removed.length) {
        const { error } = state.responseCount > 0
          ? await supabase.from('questions')
              .update({ deleted_at: new Date().toISOString() }).in('id', removed)
          : await supabase.from('questions').delete().in('id', removed);
        if (error) throw error;
      }

      // (3) تحديث وإدراج
      for (let i = 0; i < state.questions.length; i++) {
        const q = state.questions[i];
        const row = {
          survey_id:  surveyId,
          sort_order: i + 1,
          type:       q.type,
          label:      q.label.trim(),
          help_text:  q.help_text.trim() || null,
          required:   q.required,
          options:    CHOICE_TYPES.includes(q.type) ? q.options : [],
          config:     q.config
        };

        if (q.id) {
          const { error } = await supabase.from('questions')
            .update(row).eq('id', q.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from('questions')
            .insert(row).select('id').single();
          if (error) throw error;
          q.id = data.id;
        }
      }

      state.originalIds = state.questions.map(q => q.id);
      if (!state.survey) state.survey = { id: surveyId, created_at: new Date().toISOString() };
      state.survey.card_config = meta.card_config;
      // الأسئلة الجديدة صار لها معرّفات — تظهر الآن في قوائم أدوار البطاقة
      if (cardToggle.checked) renderCardRoles();

      notify('success', 'حُفظت التغييرات. رابط الاستبيان: ' + publicLink(meta.slug));

    } catch (err) {
      console.error(err);
      const msg = err && err.code === '23505'
        ? 'معرّف الرابط مستخدَم في استبيان آخر — اختر معرّفاً مختلفاً.'
        : 'تعذّر الحفظ: ' + ((err && err.message) || '');
      notify('error', msg);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = original;
    }
  });

})();
