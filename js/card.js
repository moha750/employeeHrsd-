// ============================================================
// البطاقة الاختيارية — تُبنى من card_config الخاص بكل استبيان
// ------------------------------------------------------------
// card_config يربط أدوار البطاقة بمعرّفات الأسئلة، ويسمح بتخصيص
// نصوصها. الأدوار: recipient · sender · org · values · message
// النصوص: ribbon · headline · body · to_label · from_label ·
//          values_label · share_text
// كل شيء اختياري: الدور غير المربوط يُخفى عنصره من البطاقة.
// ============================================================

(function () {
  'use strict';

  // النصوص الافتراضية — تُطابق بطاقة «صديقي المهني» الأصلية حرفياً
  const DEFAULTS = {
    ribbon:       null,   // بلا قيمة → عنوان الاستبيان
    headline:     'لقد تم ترشيحك كصديق مهني من أحد زملائك',
    body:         'أردت أن أخبرك اليوم أن وجودك في بيئة العمل جاذبٌ لي بالدعم النفسي والاستمرار بالعطاء.',
    to_label:     'إلى صديقي المهني',
    from_label:   'من',
    values_label: 'القيم التي أقدّرها فيك'
  };

  const $ = id => document.getElementById(id);

  let blob      = null;    // ذاكرة الصورة المولّدة
  let recipient = '';      // لاسم الملف ونص المشاركة
  let shareText = '';

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // نص الإجابة كما يُعرض على البطاقة
  function textOf(q, v) {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.join('، ');
    if (q && q.type === 'rating') {
      const max = (q.config && q.config.max) != null ? q.config.max : 5;
      return v + ' / ' + max;
    }
    return String(v);
  }

  // يضبط نص عنصر ويخفيه إن كان فارغاً
  function setText(el, value) {
    if (!el) return false;
    const has = value !== null && value !== undefined && String(value).trim() !== '';
    el.textContent = has ? String(value) : '';
    // العناصر الأب في التصميم تعتمد على وجود النص
    return has;
  }


  // ============================================================
  // الواجهة التي يستدعيها js/survey.js
  // ============================================================
  window.renderSurveyCard = function (survey, questions, answers) {
    const slot = $('card-slot');
    if (!slot) return false;

    const cfg = (survey.card_config && typeof survey.card_config === 'object')
      ? survey.card_config : {};

    const byId = {};
    questions.forEach(q => { byId[q.id] = q; });

    // قيمة دور معيّن من الإجابات
    const roleValue = role => {
      const qid = cfg[role];
      if (!qid || !(qid in answers)) return null;
      return { q: byId[qid], v: answers[qid] };
    };
    const roleText = role => {
      const r = roleValue(role);
      return r ? textOf(r.q, r.v) : '';
    };

    // ---------- النصوص الثابتة ----------
    setText($('pc-ribbon'),       cfg.ribbon       || DEFAULTS.ribbon || survey.title);
    setText($('pc-headline'),     cfg.headline     || DEFAULTS.headline);
    setText($('pc-body'),         cfg.body         || DEFAULTS.body);
    setText($('pc-to-label'),     cfg.to_label     || DEFAULTS.to_label);
    setText($('pc-from-label'),   cfg.from_label   || DEFAULTS.from_label);
    setText($('pc-values-label'), cfg.values_label || DEFAULTS.values_label);

    // ---------- الأدوار ----------
    // الدور غير المربوط (أو بلا إجابة) يُخفي كتلته كاملةً بدل عرض شرطة
    const fill = (elId, role, wrapperSel) => {
      const el = $(elId);
      if (!el) return false;
      const value = roleText(role);
      const has = value.trim() !== '';
      el.textContent = has ? value : '';
      const wrap = wrapperSel ? el.closest(wrapperSel) : el;
      if (wrap) wrap.hidden = !has;
      return has;
    };

    recipient = roleText('recipient');
    fill('pc-recipient', 'recipient', '.pro-card__to');
    const hasSender = fill('pc-sender', 'sender', '.pro-card__from');
    const hasOrg    = fill('pc-org',    'org',    null);

    // تذييل البطاقة يُخفى إذا خلا من المرسل وجهة العمل
    const footer = document.querySelector('.pro-card__footer');
    if (footer) footer.hidden = !hasSender && !hasOrg;

    // القيم: شرائح
    const valuesEl    = $('pc-values');
    const valuesLabel = $('pc-values-label');
    const vr = roleValue('values');
    const list = vr ? (Array.isArray(vr.v) ? vr.v : [vr.v]).filter(x =>
      x !== null && x !== undefined && String(x).trim() !== '') : [];
    if (valuesEl) {
      valuesEl.innerHTML = list
        .map(v => '<span class="pro-card__value">' + esc(v) + '</span>').join('');
      valuesEl.hidden = list.length === 0;
    }
    if (valuesLabel) valuesLabel.hidden = list.length === 0;

    // الرسالة الشخصية: اقتباس، تُخفى إن غابت
    const personal = $('pc-personal');
    const msg = roleText('message');
    if (personal) {
      if (msg) { personal.textContent = '«' + msg + '»'; personal.hidden = false; }
      else     { personal.textContent = ''; personal.hidden = true; }
    }

    // ---------- نص المشاركة ----------
    shareText = buildShareText(survey, cfg);

    // ---------- إظهار البطاقة وأزرارها ----------
    blob = null;
    slot.hidden = false;
    const dl = $('download-btn'), wa = $('whatsapp-btn');
    if (dl) dl.hidden = false;
    if (wa) wa.hidden = false;
    return true;
  };

  // إخفاء البطاقة وأزرارها (عند «إجابة جديدة» أو استبيان بلا بطاقة)
  window.hideSurveyCard = function () {
    blob = null;
    const slot = $('card-slot');
    if (slot) slot.hidden = true;
    const dl = $('download-btn'), wa = $('whatsapp-btn');
    if (dl) dl.hidden = true;
    if (wa) wa.hidden = true;
  };


  function buildShareText(survey, cfg) {
    if (cfg.share_text) {
      return String(cfg.share_text).replace(/\{recipient\}/g, recipient || '');
    }
    const lines = ['🌟 ' + survey.title, ''];
    if (recipient) {
      lines.push('مرحبًا ' + recipient + '،');
      lines.push('وصلتك بطاقة تقدير من أحد زملائك 💚');
    } else {
      lines.push('وصلتك بطاقة تقدير 💚');
    }
    lines.push('');
    lines.push('فرع وزارة الموارد البشرية والتنمية الاجتماعية بالمنطقة الشرقية — مشروع الرفاه الوظيفي');
    return lines.join('\n');
  }


  // ============================================================
  // توليد الصورة
  // ============================================================
  async function makeBlob() {
    if (blob) return blob;
    const node = $('pro-card');
    if (!node) throw new Error('pro-card element missing');
    if (typeof window.html2canvas !== 'function') {
      throw new Error('html2canvas library not loaded');
    }
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (_) {}
    }
    const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 2));
    const canvas = await window.html2canvas(node, {
      scale, backgroundColor: null, useCORS: true, logging: false
    });
    blob = await new Promise(res => canvas.toBlob(res, 'image/png', 1));
    return blob;
  }

  function fileName() {
    const safe = (recipient || 'بطاقة').trim()
      .replace(/[\\/:*?"<>|]/g, '').slice(0, 40);
    return 'بطاقة-' + safe + '.png';
  }

  function download(b, name) {
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toast(message, type) {
    if (typeof window.surveyToast === 'function') { window.surveyToast(message, type); return; }
    console.log(message);
  }

  // ---------- زر التحميل ----------
  const dlBtn = $('download-btn');
  if (dlBtn) dlBtn.addEventListener('click', async () => {
    const label = dlBtn.querySelector('span');
    const original = label ? label.textContent : '';
    dlBtn.disabled = true;
    if (label) label.textContent = 'جاري التوليد…';
    try {
      download(await makeBlob(), fileName());
      toast('تم تحميل البطاقة بنجاح', 'success');
    } catch (err) {
      console.error('تعذر توليد البطاقة:', err);
      toast('تعذّر توليد صورة البطاقة', 'error');
    } finally {
      dlBtn.disabled = false;
      if (label) label.textContent = original;
    }
  });

  // ---------- زر واتساب ----------
  const waBtn = $('whatsapp-btn');
  if (waBtn) waBtn.addEventListener('click', async () => {
    const label = waBtn.querySelector('span');
    const original = label ? label.textContent : '';
    waBtn.disabled = true;
    if (label) label.textContent = 'جاري التجهيز…';
    try {
      const b = await makeBlob();
      const file = new File([b], fileName(), { type: 'image/png' });

      // (1) المشاركة الأصلية مع إرفاق الصورة (الأفضل على الجوال)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: shareText });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;   // ألغى المستخدم
        }
      }

      // (2) خطة بديلة: تنزيل الصورة + فتح واتساب برسالة نصية
      download(b, fileName());
      window.open('https://wa.me/?text=' + encodeURIComponent(shareText),
                  '_blank', 'noopener');
      toast('تم تنزيل البطاقة — أرفقها في محادثة واتساب', 'success');
    } catch (err) {
      console.error('تعذر المشاركة:', err);
      toast('تعذّرت المشاركة عبر واتساب', 'error');
    } finally {
      waBtn.disabled = false;
      if (label) label.textContent = original;
    }
  });

})();
