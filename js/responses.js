// ============================================================
// عرض ردود الاستبيانات — يعمل مع أي استبيان مهما كانت أسئلته
// الأعمدة والفلاتر والتحليل والتصدير كلها تُشتق من جدول questions.
// ============================================================

(function () {
  'use strict';

  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || config.url.includes('YOUR_PROJECT_ID')) {
    document.body.innerHTML =
      '<div style="padding:40px;text-align:center;font-family:HRSD,sans-serif;color:#f59c00;">' +
      'لم يتم إعداد ملف js/config.js بعد.</div>';
    return;
  }
  const supabase = window.supabase.createClient(config.url, config.anonKey);

  const TYPE_LABEL = {
    short_text:'نص قصير', long_text:'فقرة', single_choice:'اختيار واحد',
    multi_choice:'عدة اختيارات', dropdown:'قائمة منسدلة', rating:'تقييم رقمي', date:'تاريخ'
  };
  const CHOICE_TYPES = ['single_choice', 'multi_choice', 'dropdown'];
  const TEXT_TYPES   = ['short_text', 'long_text'];

  const $ = id => document.getElementById(id);
  const loginSection = $('login-section');
  const dashboard    = $('dashboard-section');
  const loginForm    = $('login-form');
  const loginAlert   = $('login-alert');
  const loginBtn     = $('login-btn');
  const logoutBtn    = $('logout-btn');
  const exportBtn    = $('export-btn');
  const alertBox     = $('rs-alert');
  const surveySelect = $('survey-select');
  const surveyMeta   = $('survey-meta');
  const statsGrid    = $('stats-grid');
  const qaPanel      = $('qa-panel');
  const qaList       = $('qa-list');
  const qaToggle     = $('qa-toggle');
  const toolbar      = $('admin-toolbar');
  const searchInput  = $('search-input');
  const filterSelect = $('filter-answer');
  const sortSelect   = $('sort-by');
  const resultCount  = $('result-count');
  const grid         = $('responses-grid');
  const pagination   = $('pagination');
  const drawer       = $('drawer');
  const drawerOrg    = $('drawer-org');
  const drawerTitle  = $('drawer-title');
  const drawerDate   = $('drawer-date');
  const drawerBody   = $('drawer-body');

  const state = {
    surveys: [], survey: null, questions: [],
    all: [], filtered: [],
    search: '', filter: '', sort: 'newest',
    page: 1, perPage: 12
  };
  let lastFocused = null;


  // ============================================================
  // أدوات
  // ============================================================
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function notify(type, msg) {
    alertBox.innerHTML = '<div class="alert alert-' + type + '"><span>' +
      (type === 'error' ? '⚠️' : '✓') + '</span><span>' + esc(msg) + '</span></div>';
    if (type === 'success') setTimeout(() => { alertBox.innerHTML = ''; }, 4000);
  }

  function fullDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('ar-SA',
      { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  function shortDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ar-SA', { month:'short', day:'numeric' });
  }

  function relDate(iso) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60)     return 'قبل لحظات';
    if (diff < 3600)   return 'قبل ' + Math.floor(diff / 60) + ' دقيقة';
    if (diff < 86400)  return 'قبل ' + Math.floor(diff / 3600) + ' ساعة';
    if (diff < 604800) return 'قبل ' + Math.floor(diff / 86400) + ' يوم';
    return new Date(iso).toLocaleDateString('ar-SA', { year:'numeric', month:'short', day:'numeric' });
  }

  // تحويل أي إجابة إلى نص للعرض والبحث والتصدير
  function answerText(q, v) {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.join('، ');
    if (q && q.type === 'rating') {
      const max = (q.config && q.config.max) != null ? q.config.max : 5;
      return v + ' من ' + max;
    }
    if (q && q.type === 'date') {
      const d = new Date(v);
      return isNaN(d) ? String(v) : d.toLocaleDateString('ar-SA',
        { year:'numeric', month:'long', day:'numeric' });
    }
    return String(v);
  }

  function answerOf(row, q) { return row.data ? row.data[q.id] : undefined; }

  function hasAnswer(v) {
    return !(v === null || v === undefined || v === '' ||
             (Array.isArray(v) && v.length === 0));
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
      email: $('email').value.trim(), password: $('password').value });
    if (error) {
      loginAlert.innerHTML = '<div class="alert alert-error"><span>⚠️</span>' +
        '<span>البريد الإلكتروني أو كلمة السر غير صحيحة</span></div>';
      loginBtn.disabled = false; loginBtn.textContent = 'دخول';
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
    loginBtn.disabled = false; loginBtn.textContent = 'دخول';
    state.all = []; state.filtered = [];
  });

  function showDashboard() {
    loginSection.style.display = 'none';
    dashboard.style.display = '';
    document.body.classList.remove('is-locked');
    document.body.style.overflow = '';
    document.querySelector('.sticky-bar')?.classList.remove('is-visible');
    drawer.classList.remove('is-open');
  }


  // ============================================================
  // تحميل الاستبيانات ثم الردود
  // ============================================================
  async function loadSurveys() {
    const { data, error } = await supabase.from('surveys')
      .select('*').order('created_at', { ascending: false });
    if (error) { notify('error', 'تعذّر تحميل الاستبيانات'); return; }

    state.surveys = data || [];
    if (!state.surveys.length) {
      surveySelect.innerHTML = '<option>لا توجد استبيانات</option>';
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">' +
        '<div class="empty-icon">📋</div><div>لا توجد استبيانات بعد.</div></div>';
      return;
    }

    surveySelect.innerHTML = state.surveys.map(s =>
      '<option value="' + s.id + '">' + esc(s.title) + '</option>').join('');

    // الاستبيان المطلوب في الرابط، وإلا الأول
    const wanted = new URLSearchParams(location.search).get('s');
    const match  = wanted && state.surveys.find(s => s.slug === wanted);
    surveySelect.value = (match || state.surveys[0]).id;
    await loadResponses();
  }

  surveySelect.addEventListener('change', loadResponses);

  async function loadResponses() {
    const survey = state.surveys.find(s => s.id === surveySelect.value);
    if (!survey) return;
    state.survey = survey;
    state.page = 1;
    state.search = ''; state.filter = ''; state.sort = 'newest';
    searchInput.value = ''; sortSelect.value = 'newest';

    grid.innerHTML = '<div class="loading">جارٍ التحميل…</div>';
    qaPanel.hidden = true;
    toolbar.style.display = 'none';

    try {
      // الأسئلة — بما فيها المحذوفة ناعماً، لأن ردوداً قديمة قد تحتوي إجاباتها
      const { data: qs, error: qErr } = await supabase.from('questions')
        .select('*').eq('survey_id', survey.id)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
      if (qErr) throw qErr;

      state.questions = (qs || []).map(q => ({
        ...q,
        options: Array.isArray(q.options) ? q.options : [],
        config:  (q.config && typeof q.config === 'object') ? q.config : {}
      }));

      // الردود على دفعات (تجاوز حد 1000 صف)
      const PAGE = 1000;
      const all = [];
      let from = 0;
      for (;;) {
        const { data, error } = await supabase.from('responses')
          .select('*').eq('survey_id', survey.id)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || !data.length) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      state.all = all;

      surveyMeta.textContent =
        (survey.status === 'active' ? 'مفتوح' :
         survey.status === 'closed' ? 'مغلق' : 'مسودّة') +
        ' · ' + state.questions.filter(q => !q.deleted_at).length + ' سؤال';

      renderStats();
      renderAnalysis();
      buildFilterOptions();
      toolbar.style.display = state.all.length ? '' : 'none';
      applyAndRender();

    } catch (err) {
      console.error(err);
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">' +
        '<div class="empty-icon">⚠️</div><div>تعذّر تحميل الردود: ' +
        esc(err.message || '') + '</div></div>';
    }
  }


  // ============================================================
  // الإحصائيات
  // ============================================================
  function renderStats() {
    const n = state.all.length;
    const dates = state.all.map(r => r.created_at).filter(Boolean).sort();
    const answered = state.questions.filter(q => !q.deleted_at).length;

    let filled = 0, slots = 0;
    state.all.forEach(r => {
      state.questions.forEach(q => {
        if (q.deleted_at) return;
        slots++;
        if (hasAnswer(answerOf(r, q))) filled++;
      });
    });
    const rate = slots ? Math.round((filled / slots) * 100) : 0;

    const card = (v, l, sm) =>
      '<div class="stat-card"><span class="stat-value' + (sm ? ' stat-value--sm' : '') +
      '">' + v + '</span><span class="stat-label">' + l + '</span></div>';

    // فترة الردود في بطاقة واحدة — أربع بطاقات تملأ الصف بانتظام
    const span = dates.length
      ? (dates.length === 1
          ? shortDate(dates[0])
          : shortDate(dates[0]) + ' ← ' + shortDate(dates[dates.length - 1]))
      : '—';

    statsGrid.innerHTML =
      card(n.toLocaleString('ar-SA'), 'إجمالي الردود') +
      card(answered, 'عدد الأسئلة') +
      card(rate + '٪', 'نسبة اكتمال الإجابات') +
      card(esc(span), 'فترة الردود', true);
  }


  // ============================================================
  // تحليل الأسئلة
  // ============================================================
  function renderAnalysis() {
    if (!state.all.length || !state.questions.length) { qaPanel.hidden = true; return; }
    qaPanel.hidden = false;

    qaList.innerHTML = state.questions.map((q, i) => {
      const answers = state.all.map(r => answerOf(r, q)).filter(hasAnswer);
      const n = answers.length;
      let body = '';

      if (CHOICE_TYPES.includes(q.type)) {
        const counts = {};
        answers.forEach(a => (Array.isArray(a) ? a : [a])
          .forEach(v => { counts[v] = (counts[v] || 0) + 1; }));
        // الخيارات المعرّفة أولاً، ثم أي قيمة قديمة لم تعد ضمنها
        const keys = q.options.concat(
          Object.keys(counts).filter(k => !q.options.includes(k)));
        const max = Math.max(1, ...Object.values(counts));
        body = keys.map(opt => {
          const c = counts[opt] || 0;
          const pct = n ? Math.round((c / n) * 100) : 0;
          return '<div class="qa-row">' +
            '<span class="qa-row__label">' + esc(opt) +
              (q.options.includes(opt) ? '' : ' <em>(خيار سابق)</em>') + '</span>' +
            '<span class="qa-bar"><span class="qa-bar__fill" style="width:' +
              Math.round((c / max) * 100) + '%"></span></span>' +
            '<span class="qa-row__val">' + c + ' · ' + pct + '٪</span>' +
          '</div>';
        }).join('');

      } else if (q.type === 'rating') {
        const min = q.config.min != null ? q.config.min : 1;
        const max = q.config.max != null ? q.config.max : 5;
        const nums = answers.map(Number).filter(Number.isFinite);
        const avg  = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
        const counts = {};
        nums.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
        const peak = Math.max(1, ...Object.values(counts));

        let rows = '';
        for (let v = min; v <= max; v++) {
          const c = counts[v] || 0;
          const pct = nums.length ? Math.round((c / nums.length) * 100) : 0;
          rows += '<div class="qa-row">' +
            '<span class="qa-row__label">' + v + '</span>' +
            '<span class="qa-bar"><span class="qa-bar__fill" style="width:' +
              Math.round((c / peak) * 100) + '%"></span></span>' +
            '<span class="qa-row__val">' + c + ' · ' + pct + '٪</span>' +
          '</div>';
        }
        body = '<div class="qa-avg">المتوسط: <strong>' + avg.toFixed(2) +
               '</strong> من ' + max + '</div>' + rows;

      } else if (q.type === 'date') {
        const ds = answers.map(a => String(a)).sort();
        body = '<div class="qa-avg">من <strong>' + esc(ds[0] || '—') +
               '</strong> إلى <strong>' + esc(ds[ds.length - 1] || '—') + '</strong></div>';

      } else {
        const lens = answers.map(a => String(a).length);
        const avgLen = lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : 0;
        body = '<div class="qa-avg">أُجيب عليه <strong>' + n +
               '</strong> مرة · متوسط الطول <strong>' + avgLen + '</strong> حرفاً</div>';
      }

      return '<div class="qa-item">' +
        '<div class="qa-item__head">' +
          '<span class="q-item__num">' + (i + 1) + '</span>' +
          '<span class="qa-item__label">' + esc(q.label) +
            (q.deleted_at ? ' <em>(سؤال محذوف)</em>' : '') + '</span>' +
          '<span class="q-item__type">' + TYPE_LABEL[q.type] + '</span>' +
          '<span class="qa-item__n">' + n + ' إجابة</span>' +
        '</div>' +
        '<div class="qa-item__body">' + body + '</div>' +
      '</div>';
    }).join('');
  }

  qaToggle.addEventListener('click', () => {
    const hidden = qaList.hasAttribute('hidden');
    if (hidden) { qaList.removeAttribute('hidden'); qaToggle.textContent = 'إخفاء'; }
    else        { qaList.setAttribute('hidden', ''); qaToggle.textContent = 'إظهار'; }
  });


  // ============================================================
  // الفلترة والبحث والترتيب
  // ============================================================
  // قيمة الفلتر = "<question_id> <option>" — المعرّف UUID بلا مسافات
  function buildFilterOptions() {
    let html = '<option value="">كل الإجابات</option>';
    state.questions.forEach(q => {
      if (!CHOICE_TYPES.includes(q.type)) return;
      const seen = new Set(q.options);
      state.all.forEach(r => {
        const a = answerOf(r, q);
        (Array.isArray(a) ? a : [a]).forEach(v => { if (hasAnswer(v)) seen.add(v); });
      });
      if (!seen.size) return;
      html += '<optgroup label="' + esc(q.label) + '">' +
        Array.from(seen).map(o =>
          '<option value="' + esc(q.id + ' ' + o) + '">' + esc(o) + '</option>').join('') +
        '</optgroup>';
    });
    filterSelect.innerHTML = html;
  }

  function applyAndRender() {
    let out = state.all.slice();

    if (state.search) {
      const t = state.search.toLowerCase();
      out = out.filter(r => state.questions.some(q => {
        const v = answerOf(r, q);
        return hasAnswer(v) && answerText(q, v).toLowerCase().includes(t);
      }));
    }

    if (state.filter) {
      const sp   = state.filter.indexOf(' ');
      const qid  = state.filter.slice(0, sp);
      const val  = state.filter.slice(sp + 1);
      out = out.filter(r => {
        const v = r.data ? r.data[qid] : undefined;
        return Array.isArray(v) ? v.includes(val) : v === val;
      });
    }

    out.sort((a, b) => state.sort === 'oldest'
      ? new Date(a.created_at) - new Date(b.created_at)
      : new Date(b.created_at) - new Date(a.created_at));

    state.filtered = out;
    resultCount.textContent = out.length.toLocaleString('ar-SA');
    exportBtn.textContent = 'تصدير إكسل (' + out.length.toLocaleString('ar-SA') + ')';

    const pages = Math.ceil(out.length / state.perPage) || 1;
    if (state.page > pages) state.page = pages;

    renderCards();
    renderPagination();
  }

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value.trim();
      state.page = 1;
      applyAndRender();
    }, 200);
  });
  filterSelect.addEventListener('change', () => {
    state.filter = filterSelect.value; state.page = 1; applyAndRender();
  });
  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value; state.page = 1; applyAndRender();
  });


  // ============================================================
  // بطاقات الردود
  // ============================================================
  function renderCards() {
    if (!state.filtered.length) {
      const filtered = state.search || state.filter;
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">' +
        '<div class="empty-icon">' + (filtered ? '🔍' : '🕊️') + '</div><div>' +
        (filtered ? 'لا توجد ردود تطابق بحثك' : 'لا توجد ردود على هذا الاستبيان بعد') +
        '</div></div>';
      return;
    }

    const start = (state.page - 1) * state.perPage;
    const items = state.filtered.slice(start, start + state.perPage);

    // أول سؤال نصي = عنوان البطاقة، والثاني = سطر الترويسة، وأول اختيار = الشرائح
    const live    = state.questions.filter(q => !q.deleted_at);
    const headQ   = live.find(q => TEXT_TYPES.includes(q.type)) || live[0];
    const subQ    = live.find(q => q !== headQ && TEXT_TYPES.includes(q.type));
    const chipQ   = live.find(q => CHOICE_TYPES.includes(q.type));
    const ratingQ = live.find(q => q.type === 'rating');

    grid.innerHTML = items.map((r, i) => {
      const idx  = start + i;
      const head = headQ ? answerText(headQ, answerOf(r, headQ)) : '';
      const sub  = subQ  ? answerText(subQ,  answerOf(r, subQ))  : '';
      const chipsVal = chipQ ? answerOf(r, chipQ) : null;
      const chips = hasAnswer(chipsVal)
        ? (Array.isArray(chipsVal) ? chipsVal : [chipsVal])
            .map(v => '<span class="resp-chip">' + esc(v) + '</span>').join('')
        : '';
      const rate = ratingQ && hasAnswer(answerOf(r, ratingQ))
        ? '<span class="resp-card__score">' + esc(answerText(ratingQ, answerOf(r, ratingQ))) + '</span>'
        : '';

      return '<article class="nomination-card" role="button" tabindex="0" data-index="' + idx + '">' +
        '<header class="nom-card__header">' +
          '<div class="nom-card__org">' + esc(sub || (headQ ? headQ.label : '')) + '</div>' +
          '<span class="nom-card__date">' + esc(relDate(r.created_at)) + '</span>' +
        '</header>' +
        '<div class="friend-card__names"><div class="friend-card__to">' +
          '<span class="friend-card__label">' + esc(headQ ? headQ.label : '') + '</span>' +
          '<span class="friend-card__name">' + esc(head || '—') + '</span>' +
        '</div></div>' +
        '<div class="nom-card__section">' +
          '<div class="resp-card__chips">' + chips + rate + '</div>' +
        '</div>' +
        '<div class="nom-card__footer"><span>عرض التفاصيل الكاملة</span>' +
          '<svg class="nom-card__footer-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>' +
        '</div>' +
      '</article>';
    }).join('');

    grid.querySelectorAll('.nomination-card').forEach(el => {
      const open = () => openDrawer(state.filtered[Number(el.dataset.index)], el);
      el.addEventListener('click', open);
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }


  // ============================================================
  // ترقيم الصفحات
  // ============================================================
  function renderPagination() {
    const total = state.filtered.length;
    const totalPages = Math.ceil(total / state.perPage);
    if (totalPages <= 1) { pagination.innerHTML = ''; return; }

    const cur = state.page;
    let pages = [1];
    for (let i = cur - 1; i <= cur + 1; i++) if (i > 1 && i < totalPages) pages.push(i);
    pages.push(totalPages);
    pages = [...new Set(pages)].sort((a, b) => a - b);

    let html = '<button class="pagination__btn" data-action="prev"' +
               (cur === 1 ? ' disabled' : '') + ' aria-label="السابق">&rarr;</button>';
    let last = 0;
    pages.forEach(p => {
      if (p - last > 1) html += '<span class="pagination__ellipsis">…</span>';
      html += '<button class="pagination__btn' + (p === cur ? ' is-active' : '') +
              '" data-page="' + p + '">' + p + '</button>';
      last = p;
    });
    html += '<button class="pagination__btn" data-action="next"' +
            (cur === totalPages ? ' disabled' : '') + ' aria-label="التالي">&larr;</button>' +
            '<span class="pagination__info">عرض ' + ((cur - 1) * state.perPage + 1) + '–' +
            Math.min(cur * state.perPage, total) + ' من ' + total + '</span>';

    pagination.innerHTML = html;
    pagination.querySelectorAll('.pagination__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        if (btn.dataset.action === 'prev')      state.page = Math.max(1, cur - 1);
        else if (btn.dataset.action === 'next') state.page = Math.min(totalPages, cur + 1);
        else if (btn.dataset.page)              state.page = Number(btn.dataset.page);
        applyAndRender();
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }


  // ============================================================
  // درج التفاصيل
  // ============================================================
  function openDrawer(row, source) {
    if (!row) return;
    lastFocused = source || null;

    const live  = state.questions.filter(q => !q.deleted_at);
    const headQ = live.find(q => TEXT_TYPES.includes(q.type)) || live[0];

    drawerOrg.textContent   = state.survey ? state.survey.title : '';
    drawerTitle.textContent = headQ ? (answerText(headQ, answerOf(row, headQ)) || 'رد') : 'رد';
    drawerDate.textContent  = fullDate(row.created_at);

    drawerBody.innerHTML = state.questions.map(q => {
      const v = answerOf(row, q);
      if (q.deleted_at && !hasAnswer(v)) return '';   // سؤال محذوف بلا إجابة: يُخفى

      let val;
      if (!hasAnswer(v)) {
        val = '<div class="drawer-qa__empty">لم يُجب</div>';
      } else if (Array.isArray(v)) {
        val = '<div class="resp-card__chips">' +
              v.map(x => '<span class="resp-chip">' + esc(x) + '</span>').join('') + '</div>';
      } else if (q.type === 'long_text') {
        val = '<div class="drawer-quote">' + esc(v) + '</div>';
      } else {
        val = '<div class="drawer-qa__a">' + esc(answerText(q, v)) + '</div>';
      }

      return '<section class="drawer-section">' +
        '<h3 class="drawer-section__title">' + esc(q.label) +
          (q.deleted_at ? ' <em>(سؤال محذوف)</em>' : '') + '</h3>' +
        '<div class="drawer-qa">' + val + '</div>' +
      '</section>';
    }).join('');

    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $('drawer-close').focus();
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused) { try { lastFocused.focus(); } catch (_) {} }
  }

  $('drawer-close').addEventListener('click', closeDrawer);
  $('drawer-backdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
  });


  // ============================================================
  // التصدير إلى إكسل — الأعمدة تُشتق من الأسئلة
  // ============================================================
  const XL = { teal:'FF00AA80', white:'FFFFFFFF', ink:'FF0F1C1A',
               line:'FFD9E2E0', stripe:'FFF5FBF9' };
  const BOM = '﻿';   // ليقرأ إكسل العربية في CSV

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv(rows, cols) {
    const lines = [cols.map(c => c.header).join(',')];
    rows.forEach(r => lines.push(cols.map(c => {
      const v = String(c.value(r) === undefined ? '' : c.value(r)).replace(/"/g, '""');
      return '"' + v + '"';
    }).join(',')));
    triggerDownload(new Blob([BOM + lines.join('\n')], { type:'text/csv;charset=utf-8' }),
      state.survey.slug + '-' + new Date().toISOString().slice(0, 10) + '.csv');
  }

  exportBtn.addEventListener('click', () => {
    if (!state.survey) return;
    const rows = state.filtered;
    if (!rows.length) { notify('error', 'لا توجد ردود لتصديرها.'); return; }

    // عمود التاريخ + عمود لكل سؤال (بترتيبه، والمحذوف يُعلَّم)
    const cols = [{ header:'التاريخ', width:20, value: r => fullDate(r.created_at) }]
      .concat(state.questions.map(q => ({
        header: q.label + (q.deleted_at ? ' (محذوف)' : ''),
        width:  TEXT_TYPES.includes(q.type) ? 36 : 24,
        wrap:   q.type === 'long_text' || q.type === 'multi_choice',
        value:  r => answerText(q, answerOf(r, q))
      })));

    const XLSX = window.XLSX;
    if (!XLSX) { exportCsv(rows, cols); return; }

    const lastCol = cols.length - 1;
    const titleRow = new Array(cols.length).fill('');
    titleRow[0] = state.survey.title + ' — ' +
      new Date().toLocaleDateString('ar-SA') + ' (' + rows.length + ' رد)';

    const aoa = [titleRow, cols.map(c => c.header)];
    rows.forEach(r => aoa.push(cols.map(c => c.value(r))));

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [{ s:{ r:0, c:0 }, e:{ r:0, c:lastCol } }];

    const B = { style:'thin', color:{ rgb: XL.line } };
    const borders = { top:B, bottom:B, left:B, right:B };
    const put = (r, c, s) => {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t:'s', v:'' };
      ws[ref].s = s;
    };

    for (let c = 0; c <= lastCol; c++) put(0, c, {
      font:{ bold:true, sz:15, color:{ rgb: XL.white } },
      fill:{ fgColor:{ rgb: XL.teal } },
      alignment:{ horizontal:'center', vertical:'center' } });

    for (let c = 0; c <= lastCol; c++) put(1, c, {
      font:{ bold:true, sz:11, color:{ rgb: XL.white } },
      fill:{ fgColor:{ rgb: XL.teal } },
      alignment:{ horizontal:'center', vertical:'center', wrapText:true },
      border: borders });

    rows.forEach((_, ri) => cols.forEach((c, ci) => put(2 + ri, ci, {
      font:{ sz:10, color:{ rgb: XL.ink } },
      fill:{ fgColor:{ rgb: ri % 2 ? XL.stripe : XL.white } },
      alignment:{ horizontal: ci === 0 ? 'center' : 'right',
                  vertical:'center', wrapText: !!c.wrap },
      border: borders })));

    ws['!cols'] = cols.map(c => ({ wch: c.width }));
    ws['!rows'] = [{ hpt:26 }, { hpt:24 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الردود');
    wb.Workbook = { Views: [{ RTL: true }] };

    triggerDownload(
      new Blob([XLSX.write(wb, { bookType:'xlsx', type:'array' })],
        { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      state.survey.slug + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');

    notify('success', 'صُدّر ' + rows.length.toLocaleString('ar-SA') + ' رداً.');
  });

})();
