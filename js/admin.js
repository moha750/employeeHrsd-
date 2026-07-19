// ============================================================
// منطق لوحة الإدارة — مبادرة «صديقي المهني»
// ============================================================

(function () {
  'use strict';

  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || config.url.includes('YOUR_PROJECT_ID')) {
    document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:HRSD,sans-serif;color:#f59c00;">لم يتم إعداد ملف js/config.js بعد.</div>';
    return;
  }

  const supabase = window.supabase.createClient(config.url, config.anonKey);

  // ===== أدوات مساعدة =====
  function toValues(row) {
    // values_selected قد تأتي كمصفوفة نصية من Postgres
    if (Array.isArray(row.values_selected)) return row.values_selected;
    if (typeof row.values_selected === 'string') {
      return row.values_selected.replace(/^\{|\}$/g, '').split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
    }
    return [];
  }

  // عناصر DOM
  const loginSection      = document.getElementById('login-section');
  const dashboardSection  = document.getElementById('dashboard-section');
  const loginForm         = document.getElementById('login-form');
  const loginBtn          = document.getElementById('login-btn');
  const logoutBtn         = document.getElementById('logout-btn');
  const exportBtn         = document.getElementById('export-btn');
  const loginAlert        = document.getElementById('login-alert');
  const statsGrid         = document.getElementById('stats-grid');
  const toolbar           = document.getElementById('admin-toolbar');
  const grid              = document.getElementById('nominations-grid');
  const pagination        = document.getElementById('pagination');
  const searchInput       = document.getElementById('search-input');
  const filterOrgSelect   = document.getElementById('filter-org');
  const sortBySelect      = document.getElementById('sort-by');
  const resultCount       = document.getElementById('result-count');
  const drawer            = document.getElementById('drawer');
  const drawerBackdrop    = document.getElementById('drawer-backdrop');
  const drawerCloseBtn    = document.getElementById('drawer-close');
  const drawerOrg         = document.getElementById('drawer-org');
  const drawerTitle       = document.getElementById('drawer-title');
  const drawerDate        = document.getElementById('drawer-date');
  const drawerBody        = document.getElementById('drawer-body');

  // عناصر نافذة التصدير
  const exportModal        = document.getElementById('export-modal');
  const exportModalBackdrop= document.getElementById('export-modal-backdrop');
  const exportModalClose   = document.getElementById('export-modal-close');
  const exportCancelBtn    = document.getElementById('export-cancel');
  const exportConfirmBtn   = document.getElementById('export-confirm');
  const exportOrgsWrap     = document.getElementById('export-orgs');
  const exportOrgsList     = document.getElementById('export-orgs-list');
  const exportOrgsSearch   = document.getElementById('export-orgs-search');
  const exportOrgsCount    = document.getElementById('export-orgs-count');
  const exportOrgsAllBtn   = document.getElementById('export-orgs-all');
  const exportOrgsNoneBtn  = document.getElementById('export-orgs-none');

  // الحالة العامة
  const state = {
    all: [],
    filtered: [],
    search: '',
    orgFilter: '',
    sort: 'newest',
    page: 1,
    perPage: 12
  };

  let lastFocusedCard = null;

  // ===== التحقق من جلسة موجودة =====
  (async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      showDashboard();
      await loadCards();
    }
  })();

  // ===== تسجيل الدخول =====
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginAlert.innerHTML = '';
    loginBtn.disabled = true;
    loginBtn.textContent = 'جاري الدخول…';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      loginAlert.innerHTML = `
        <div class="alert alert-error">
          <span>⚠️</span>
          <span>البريد الإلكتروني أو كلمة السر غير صحيحة</span>
        </div>
      `;
      loginBtn.disabled = false;
      loginBtn.textContent = 'دخول';
      return;
    }

    showDashboard();
    await loadCards();
  });

  // ===== تسجيل الخروج =====
  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    dashboardSection.style.display = 'none';
    loginSection.style.display = '';
    document.body.classList.add('is-locked');
    loginForm.reset();
    loginBtn.disabled = false;
    loginBtn.textContent = 'دخول';
    state.all = [];
    state.filtered = [];
  });

  function showDashboard() {
    loginSection.style.display = 'none';
    dashboardSection.style.display = '';
    document.body.classList.remove('is-locked');
    document.body.style.overflow = '';
    document.querySelector('.sticky-bar')?.classList.remove('is-visible');
    document.getElementById('drawer')?.classList.remove('is-open');
  }

  // ===== جلب البطاقات =====
  async function loadCards() {
    grid.innerHTML = '<div class="loading">جاري تحميل البيانات…</div>';

    const PAGE_SIZE = 1000;
    const all = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('friend_cards')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        grid.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <div>حدث خطأ في تحميل البيانات: ${escapeHtml(error.message)}</div>
          </div>
        `;
        return;
      }

      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    state.all = all;
    populateOrgFilter(state.all);
    await renderStats(state.all);
    toolbar.style.display = state.all.length > 0 ? '' : 'none';
    applyFiltersAndRender();
  }

  // ===== الإحصائيات =====
  async function renderStats(data) {
    const total = data.length;
    const uniqueOrgs = new Set(data.map(d => d.organization).filter(Boolean)).size;
    const uniqueRecipients = new Set(data.map(d => (d.recipient_name || '').trim()).filter(Boolean)).size;

    // القيمة الأكثر تكراراً
    const valueCounts = {};
    data.forEach(d => toValues(d).forEach(v => { valueCounts[v] = (valueCounts[v] || 0) + 1; }));
    let topValue = '—';
    let topCount = 0;
    Object.keys(valueCounts).forEach(v => {
      if (valueCounts[v] > topCount) { topCount = valueCounts[v]; topValue = v; }
    });

    const visitors = await fetchVisitorCount();

    statsGrid.innerHTML = `
      <div class="stat-card">
        <span class="stat-value">${total}</span>
        <span class="stat-label">إجمالي البطاقات</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${uniqueRecipients}</span>
        <span class="stat-label">عدد الأصدقاء المهنيين</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${uniqueOrgs}</span>
        <span class="stat-label">عدد الجهات المشاركة</span>
      </div>
      <div class="stat-card">
        <span class="stat-value stat-value--sm">${escapeHtml(topValue)}</span>
        <span class="stat-label">القيمة الأكثر تقديرًا</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${visitors === null ? '—' : visitors}</span>
        <span class="stat-label">عدد زيارات الموقع</span>
      </div>
    `;
  }

  async function fetchVisitorCount() {
    const { data, error } = await supabase
      .from('site_stats')
      .select('value')
      .eq('key', 'visitors')
      .single();
    if (error) return null;
    return data.value;
  }

  // ===== ملء dropdown الجهات =====
  function populateOrgFilter(data) {
    const orgs = Array.from(new Set(data.map(d => d.organization).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ar'));
    const current = filterOrgSelect.value;
    filterOrgSelect.innerHTML = '<option value="">كل الجهات</option>' +
      orgs.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
    if (current && orgs.includes(current)) filterOrgSelect.value = current;
  }

  // ===== تطبيق البحث/الفلترة/الترتيب =====
  function applyFiltersAndRender() {
    let result = [...state.all];

    if (state.search) {
      const q = state.search.toLowerCase();
      result = result.filter(r => {
        const fields = [
          r.organization, r.sender_name, r.recipient_name,
          r.personal_message, toValues(r).join(' ')
        ];
        return fields.some(f => f && String(f).toLowerCase().includes(q));
      });
    }

    if (state.orgFilter) {
      result = result.filter(r => r.organization === state.orgFilter);
    }

    switch (state.sort) {
      case 'oldest':
        result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        break;
      case 'org':
        result.sort((a, b) => (a.organization || '').localeCompare(b.organization || '', 'ar'));
        break;
      case 'recipient':
        result.sort((a, b) => (a.recipient_name || '').localeCompare(b.recipient_name || '', 'ar'));
        break;
      case 'sender':
        result.sort((a, b) => (a.sender_name || '').localeCompare(b.sender_name || '', 'ar'));
        break;
      default: // newest
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    state.filtered = result;

    const totalPages = Math.max(1, Math.ceil(result.length / state.perPage));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;

    resultCount.textContent = result.length.toString();
    renderCards();
    renderPagination();
  }

  // ===== رسم البطاقات =====
  function renderCards() {
    if (state.filtered.length === 0) {
      const isFiltered = state.search || state.orgFilter;
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">🕊️</div>
          <div>${isFiltered ? 'لا توجد بطاقات تطابق بحثك' : 'لا توجد بطاقات حتى الآن'}</div>
        </div>
      `;
      return;
    }

    const start = (state.page - 1) * state.perPage;
    const pageItems = state.filtered.slice(start, start + state.perPage);

    grid.innerHTML = pageItems.map((row, i) => buildCard(row, start + i)).join('');

    grid.querySelectorAll('.nomination-card').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index, 10);
        openDrawer(state.filtered[idx], el);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const idx = parseInt(el.dataset.index, 10);
          openDrawer(state.filtered[idx], el);
        }
      });
    });
  }

  function buildCard(row, idx) {
    const dateStr = formatRelativeDate(row.created_at);
    const values = toValues(row);
    const chips = values.map(v => `<span class="resp-chip">${escapeHtml(v)}</span>`).join('');

    return `
      <article class="nomination-card" role="button" tabindex="0" data-index="${idx}" aria-label="عرض بطاقة ${escapeHtml(row.recipient_name || '')}">
        <header class="nom-card__header">
          <div class="nom-card__org">${escapeHtml(row.organization || 'بدون جهة')}</div>
          <span class="nom-card__date">${escapeHtml(dateStr)}</span>
        </header>

        <div class="friend-card__names">
          <div class="friend-card__to">
            <span class="friend-card__label">إلى صديقي المهني</span>
            <span class="friend-card__name">${escapeHtml(row.recipient_name || '—')}</span>
          </div>
          <div class="friend-card__from">
            <span class="friend-card__label">من</span>
            <span class="friend-card__from-name">${escapeHtml(row.sender_name || '—')}</span>
          </div>
        </div>

        <div class="nom-card__section">
          <div class="resp-card__chips">${chips}</div>
          ${row.personal_message ? `<div class="resp-card__hastext">✍️ تحتوي رسالة شخصية</div>` : ''}
        </div>

        <div class="nom-card__footer">
          <span>عرض التفاصيل الكاملة</span>
          <svg class="nom-card__footer-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </div>
      </article>
    `;
  }

  // ===== ترقيم الصفحات =====
  function renderPagination() {
    const total = state.filtered.length;
    const totalPages = Math.ceil(total / state.perPage);

    if (totalPages <= 1) {
      pagination.innerHTML = '';
      return;
    }

    const cur = state.page;
    const start = (cur - 1) * state.perPage + 1;
    const end = Math.min(cur * state.perPage, total);

    let pages = [];
    const range = 1;
    pages.push(1);
    for (let i = cur - range; i <= cur + range; i++) {
      if (i > 1 && i < totalPages) pages.push(i);
    }
    if (totalPages > 1) pages.push(totalPages);
    pages = [...new Set(pages)].sort((a, b) => a - b);

    let html = '';
    html += `<button class="pagination__btn" data-action="prev" ${cur === 1 ? 'disabled' : ''} aria-label="الصفحة السابقة">→</button>`;

    let lastShown = 0;
    pages.forEach(p => {
      if (p - lastShown > 1) {
        html += `<span class="pagination__ellipsis">…</span>`;
      }
      html += `<button class="pagination__btn ${p === cur ? 'is-active' : ''}" data-page="${p}" aria-label="الصفحة ${p}" ${p === cur ? 'aria-current="page"' : ''}>${p}</button>`;
      lastShown = p;
    });

    html += `<button class="pagination__btn" data-action="next" ${cur === totalPages ? 'disabled' : ''} aria-label="الصفحة التالية">←</button>`;
    html += `<span class="pagination__info">عرض ${start}–${end} من ${total}</span>`;

    pagination.innerHTML = html;

    pagination.querySelectorAll('.pagination__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const action = btn.dataset.action;
        const page = btn.dataset.page;
        if (action === 'prev') state.page = Math.max(1, cur - 1);
        else if (action === 'next') state.page = Math.min(totalPages, cur + 1);
        else if (page) state.page = parseInt(page, 10);
        applyFiltersAndRender();
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // ===== Drawer التفاصيل =====
  function openDrawer(row, sourceCard) {
    if (!row) return;
    lastFocusedCard = sourceCard || null;

    const values = toValues(row);

    drawerOrg.textContent = row.organization || 'بدون جهة';
    drawerTitle.textContent = row.recipient_name || 'بطاقة صديق مهني';
    drawerDate.textContent = formatFullDate(row.created_at);

    const parties = `
      <section class="drawer-section">
        <h3 class="drawer-section__title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          أطراف البطاقة
        </h3>
        <div class="person-card">
          <div class="person-card__title">إلى صديقي المهني</div>
          <div class="person-card__name">${escapeHtml(row.recipient_name || '—')}</div>
        </div>
        <div class="person-card">
          <div class="person-card__title">من (المُرسِل)</div>
          <div class="person-card__name">${escapeHtml(row.sender_name || '—')}</div>
        </div>
        <div class="person-card">
          <div class="person-card__title">جهة العمل</div>
          <div class="person-card__name">${escapeHtml(row.organization || '—')}</div>
        </div>
      </section>
    `;

    const valuesHtml = `
      <section class="drawer-section">
        <h3 class="drawer-section__title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          القيم التي يقدّرها فيه
        </h3>
        <div class="resp-card__chips">
          ${values.length ? values.map(v => `<span class="resp-chip">${escapeHtml(v)}</span>`).join('') : '<span class="rating-readout__scale">—</span>'}
        </div>
      </section>
    `;

    const messageHtml = `
      <section class="drawer-section">
        <h3 class="drawer-section__title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          نص البطاقة
        </h3>
        <div class="drawer-qa">
          <div class="drawer-quote">أردت أن أخبرك اليوم أن وجودك في بيئة العمل جاذبٌ لي بالدعم النفسي والاستمرار بالعطاء.</div>
        </div>
        ${row.personal_message ? `<div class="drawer-qa"><div class="drawer-qa__q">رسالة شخصية:</div><div class="drawer-quote">${escapeHtml(row.personal_message)}</div></div>` : ''}
      </section>
    `;

    drawerBody.innerHTML = parties + valuesHtml + messageHtml;

    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => drawerCloseBtn.focus(), 50);
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocusedCard) {
      lastFocusedCard.focus();
      lastFocusedCard = null;
    }
  }

  drawerCloseBtn.addEventListener('click', closeDrawer);
  drawerBackdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
      closeDrawer();
    }
  });

  // ===== أحداث شريط الأدوات =====
  let searchTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = e.target.value.trim();
      state.page = 1;
      applyFiltersAndRender();
    }, 200);
  });

  filterOrgSelect.addEventListener('change', (e) => {
    state.orgFilter = e.target.value;
    state.page = 1;
    applyFiltersAndRender();
  });

  sortBySelect.addEventListener('change', (e) => {
    state.sort = e.target.value;
    state.page = 1;
    applyFiltersAndRender();
  });

  // ===== تنسيقات التاريخ =====
  function formatRelativeDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr  = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1)  return 'الآن';
    if (diffMin < 60) return `قبل ${diffMin} د`;
    if (diffHr < 24)  return `قبل ${diffHr} س`;
    if (diffDay === 1) return 'أمس';
    if (diffDay < 7)  return `قبل ${diffDay} أيام`;
    return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatFullDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('ar-SA', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // ===== تصدير CSV (احتياطي) =====
  function downloadCsv(dataToExport, suffix) {
    const headers = ['التاريخ', 'جهة العمل', 'من (المُرسِل)', 'إلى (الصديق المهني)', 'القيم التي يقدّرها فيه', 'الرسالة الشخصية'];
    const rows = dataToExport.map(r => [
      new Date(r.created_at).toLocaleString('ar-SA'),
      r.organization || '',
      r.sender_name || '',
      r.recipient_name || '',
      toValues(r).join('، '),
      r.personal_message || ''
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    triggerDownload(
      new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }),
      `friend-cards${suffix ? '-' + suffix : ''}-${new Date().toISOString().split('T')[0]}.csv`
    );
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ===== تصدير ملف إكسل منسّق (.xlsx) =====
  const XL = {
    teal:    'FF00AA80',
    orange:  'FFF59C00',
    white:   'FFFFFFFF',
    ink:     'FF0F1C1A',
    line:    'FFD9E2E0',
    stripe:  'FFF5FBF9'
  };

  function downloadXlsx(dataToExport, suffix) {
    const XLSX = window.XLSX;
    if (!XLSX) { alert('تعذّر تحميل مكتبة إكسل، سيتم التصدير كـ CSV.'); downloadCsv(dataToExport, suffix); return; }

    const HEADERS = ['التاريخ', 'جهة العمل', 'من (المُرسِل)', 'إلى (الصديق المهني)', 'القيم التي يقدّرها فيه', 'الرسالة الشخصية'];
    const lastCol = HEADERS.length - 1;

    const titleRow = new Array(HEADERS.length).fill('');
    titleRow[0] = `بطاقات صديقي المهني — ${new Date().toLocaleDateString('ar-SA')} (${dataToExport.length} بطاقة)`;

    const aoa = [titleRow, HEADERS];
    dataToExport.forEach(r => {
      aoa.push([
        new Date(r.created_at).toLocaleString('ar-SA'),
        r.organization || '',
        r.sender_name || '',
        r.recipient_name || '',
        toValues(r).join('، '),
        r.personal_message || ''
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }];

    const BORDER = { style: 'thin', color: { rgb: XL.line } };
    const allBorders = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
    const styleCell = (r, c, s) => {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      ws[ref].s = s;
    };

    const titleStyle = {
      font: { bold: true, sz: 15, color: { rgb: XL.white } },
      fill: { fgColor: { rgb: XL.teal } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };
    const headStyle = {
      font: { bold: true, sz: 11, color: { rgb: XL.white } },
      fill: { fgColor: { rgb: XL.teal } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: allBorders
    };
    const dataStyle = (rowIdx, opts) => ({
      font: { sz: 10, color: { rgb: XL.ink }, bold: !!(opts && opts.bold) },
      fill: { fgColor: { rgb: rowIdx % 2 ? XL.stripe : XL.white } },
      alignment: { horizontal: (opts && opts.align) || 'right', vertical: 'center', wrapText: !!(opts && opts.wrap) },
      border: allBorders
    });

    for (let c = 0; c <= lastCol; c++) styleCell(0, c, titleStyle);
    for (let c = 0; c <= lastCol; c++) styleCell(1, c, headStyle);

    dataToExport.forEach((r, di) => {
      const R = 2 + di;
      styleCell(R, 0, dataStyle(di, { align: 'center' }));
      styleCell(R, 1, dataStyle(di));
      styleCell(R, 2, dataStyle(di));
      styleCell(R, 3, dataStyle(di, { bold: true }));
      styleCell(R, 4, dataStyle(di, { wrap: true }));
      styleCell(R, 5, dataStyle(di, { wrap: true }));
    });

    ws['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 22 }, { wch: 22 }, { wch: 30 }, { wch: 40 }];
    ws['!rows'] = [{ hpt: 26 }, { hpt: 24 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'البطاقات');
    wb.Workbook = { Views: [{ RTL: true }] };

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    triggerDownload(
      new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `friend-cards${suffix ? '-' + suffix : ''}-${new Date().toISOString().split('T')[0]}.xlsx`
    );
  }

  // ===== نافذة التصدير: قائمة الجهات =====
  const exportSelectedOrgs = new Set();

  function renderExportOrgs() {
    const orgs = Array.from(new Set(state.all.map(d => d.organization).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'ar'));
    const q = (exportOrgsSearch.value || '').trim().toLowerCase();
    const visible = q ? orgs.filter(o => o.toLowerCase().includes(q)) : orgs;

    if (visible.length === 0) {
      exportOrgsList.innerHTML = '<div class="export-orgs__empty">لا توجد جهات مطابقة</div>';
      return;
    }

    exportOrgsList.innerHTML = visible.map(org => {
      const checked = exportSelectedOrgs.has(org) ? 'checked' : '';
      return `<label class="export-orgs__item">
        <input type="checkbox" value="${escapeHtml(org)}" ${checked}>
        <span class="export-orgs__box" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
        <span class="export-orgs__item-name">${escapeHtml(org)}</span>
      </label>`;
    }).join('');
  }

  function updateExportCount() {
    const scope = exportModal.querySelector('input[name="export-scope"]:checked').value;
    if (scope === 'all') {
      exportOrgsCount.textContent = '';
      exportConfirmBtn.disabled = false;
      return;
    }
    const n = exportSelectedOrgs.size;
    exportOrgsCount.textContent = n === 0
      ? 'لم يتم تحديد أي جهة'
      : `تم تحديد ${n} ${n === 1 ? 'جهة' : 'جهات'}`;
    exportConfirmBtn.disabled = n === 0;
  }

  function openExportModal() {
    if (state.all.length === 0) {
      alert('لا توجد بيانات للتصدير');
      return;
    }
    exportModal.querySelector('input[name="export-scope"][value="all"]').checked = true;
    exportSelectedOrgs.clear();
    exportOrgsSearch.value = '';
    exportOrgsWrap.hidden = true;
    renderExportOrgs();
    updateExportCount();
    exportModal.classList.add('is-open');
    exportModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeExportModal() {
    exportModal.classList.remove('is-open');
    exportModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  exportBtn.addEventListener('click', openExportModal);
  exportModalBackdrop.addEventListener('click', closeExportModal);
  exportModalClose.addEventListener('click', closeExportModal);
  exportCancelBtn.addEventListener('click', closeExportModal);

  exportModal.querySelectorAll('input[name="export-scope"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const scope = radio.value;
      exportOrgsWrap.hidden = scope !== 'selected';
      updateExportCount();
    });
  });

  exportOrgsList.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    if (cb.checked) exportSelectedOrgs.add(cb.value);
    else exportSelectedOrgs.delete(cb.value);
    updateExportCount();
  });

  exportOrgsSearch.addEventListener('input', renderExportOrgs);

  exportOrgsAllBtn.addEventListener('click', () => {
    exportOrgsList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = true;
      exportSelectedOrgs.add(cb.value);
    });
    updateExportCount();
  });

  exportOrgsNoneBtn.addEventListener('click', () => {
    exportOrgsList.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    exportSelectedOrgs.clear();
    updateExportCount();
  });

  exportConfirmBtn.addEventListener('click', () => {
    const scope = exportModal.querySelector('input[name="export-scope"]:checked').value;
    let dataToExport, suffix = '';

    if (scope === 'selected') {
      if (exportSelectedOrgs.size === 0) return;
      dataToExport = state.all.filter(r => exportSelectedOrgs.has(r.organization));
      suffix = exportSelectedOrgs.size === 1
        ? Array.from(exportSelectedOrgs)[0].replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
        : `${exportSelectedOrgs.size}-جهات`;
    } else {
      dataToExport = state.all;
    }

    if (dataToExport.length === 0) {
      alert('لا توجد بيانات للتصدير');
      return;
    }

    downloadXlsx(dataToExport, suffix);
    closeExportModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && exportModal.classList.contains('is-open')) closeExportModal();
  });

  // ===== أداة هروب HTML =====
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

})();
