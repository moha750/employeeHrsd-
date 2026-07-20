// ============================================================
// منطق مبادرة «صديقي المهني» — إنشاء بطاقة تقدير للزميل
// ============================================================

(function () {
  'use strict';

  // التحقق من إعدادات Supabase
  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || config.url.includes('YOUR_PROJECT_ID')) {
    showAlert('error', 'لم يتم إعداد الاتصال بقاعدة البيانات. يرجى إعداد ملف js/config.js');
    const b = document.getElementById('submit-btn');
    if (b) b.disabled = true;
    return;
  }

  // إنشاء عميل Supabase
  const supabase = window.supabase.createClient(config.url, config.anonKey);

  // القيم المسموح بها (يجب أن تطابق قاعدة البيانات)
  const ALLOWED_VALUES = [
    'التعاون', 'الاحترام', 'الإنسانية', 'العطاء',
    'التمكين', 'المسؤولية', 'الابتكار', 'التميز'
  ];

  // عناصر DOM
  const form           = document.getElementById('card-form');
  const submitBtn      = document.getElementById('submit-btn');
  const formCard       = document.getElementById('form-card');
  const successCard    = document.getElementById('success-card');
  const newResponseBtn = document.getElementById('new-response-btn');
  const downloadBtn    = document.getElementById('download-btn');
  const whatsappBtn    = document.getElementById('whatsapp-btn');
  const valueChipsWrap = document.getElementById('value-chips');

  // عناصر البطاقة المهنية
  const proCard      = document.getElementById('pro-card');
  const pcRecipient  = document.getElementById('pc-recipient');
  const pcPersonal   = document.getElementById('pc-personal');
  const pcValues     = document.getElementById('pc-values');
  const pcSender     = document.getElementById('pc-sender');
  const pcOrg        = document.getElementById('pc-org');

  // ذاكرة الصورة المولّدة (لتفادي إعادة التوليد بين التحميل والمشاركة)
  let cardBlob = null;
  let lastRecipient = '';

  // ===== إدارة حالة الخطأ البصرية =====
  function clearInvalid() {
    form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
  }

  // إزالة علامة الخطأ فور تفاعل المستخدم
  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t === form.organization) {
      form.organization.closest('.form-group')?.classList.remove('is-invalid');
    }
    if (t.matches('input[name="values"]')) {
      valueChipsWrap.classList.remove('is-invalid');
    }
  });
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t === form.organization || t === form.sender_name || t === form.recipient_name) {
      t.closest('.form-group')?.classList.remove('is-invalid');
    }
  });

  // ===== قراءة القيم المختارة =====
  function getSelectedValues() {
    return Array.from(form.querySelectorAll('input[name="values"]:checked'))
      .map(cb => cb.value)
      .filter(v => ALLOWED_VALUES.includes(v));
  }

  // ===== التحقق من النموذج =====
  function validateForm() {
    clearInvalid();

    if (!form.organization.value) {
      const g = form.organization.closest('.form-group');
      if (g) g.classList.add('is-invalid');
      return { ok: false, message: 'يرجى اختيار الإدارة / جهة العمل', focus: form.organization };
    }
    if (!form.sender_name.value.trim()) {
      form.sender_name.closest('.form-group')?.classList.add('is-invalid');
      return { ok: false, message: 'يرجى كتابة اسمك في خانة «من»', focus: form.sender_name };
    }
    if (!form.recipient_name.value.trim()) {
      form.recipient_name.closest('.form-group')?.classList.add('is-invalid');
      return { ok: false, message: 'يرجى كتابة اسم صديقك المهني', focus: form.recipient_name };
    }
    if (getSelectedValues().length === 0) {
      valueChipsWrap.classList.add('is-invalid');
      return { ok: false, message: 'يرجى اختيار صفة واحدة على الأقل تقدّرها في زميلك', focus: valueChipsWrap };
    }
    return { ok: true };
  }

  // ===== عرض رسالة تنبيه =====
  function showAlert(type, message) {
    const alertContainer = document.getElementById('alert-container');
    if (!alertContainer) return;
    alertContainer.innerHTML = `
      <div class="alert alert-${type}">
        <span>${type === 'error' ? '⚠️' : '✓'}</span>
        <span>${message}</span>
      </div>
    `;
    alertContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearAlert() {
    const alertContainer = document.getElementById('alert-container');
    if (alertContainer) alertContainer.innerHTML = '';
  }

  // ===== تعبئة البطاقة المهنية بالبيانات =====
  function renderCard(data) {
    pcRecipient.textContent = data.recipient_name;
    pcSender.textContent    = data.sender_name;
    pcOrg.textContent       = data.organization;

    if (data.personal_message) {
      pcPersonal.textContent = '«' + data.personal_message + '»';
      pcPersonal.hidden = false;
    } else {
      pcPersonal.textContent = '';
      pcPersonal.hidden = true;
    }

    pcValues.innerHTML = data.values
      .map(v => `<span class="pro-card__value">${escapeHtml(v)}</span>`)
      .join('');

    lastRecipient = data.recipient_name;
    cardBlob = null; // إعادة ضبط الذاكرة لبطاقة جديدة
  }

  // ===== توليد صورة البطاقة (PNG) عبر html2canvas =====
  async function generateCardBlob() {
    if (cardBlob) return cardBlob;
    if (typeof window.html2canvas !== 'function') {
      throw new Error('html2canvas library not loaded');
    }
    // ضمان تحميل الخطوط قبل التصوير
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (_) {}
    }

    const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 2));
    const canvas = await window.html2canvas(proCard, {
      scale,
      backgroundColor: null,
      useCORS: true,
      logging: false
    });

    cardBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1));
    return cardBlob;
  }

  // ===== تنزيل ملف Blob =====
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function cardFileName() {
    const safe = (lastRecipient || 'صديقي-المهني').trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 40);
    return `بطاقة-صديقي-المهني-${safe}.png`;
  }

  function whatsappText() {
    const lines = [
      '🌟 مبادرة صديقي المهني',
      '',
      `مرحبًا ${lastRecipient}،`,
      'لقد تم ترشيحك كصديق مهني من أحد زملائك 💚',
      'شكرًا لأنك تصنع فرقًا في بيئة عملك.',
      '',
      'فرع وزارة الموارد البشرية والتنمية الاجتماعية بالمنطقة الشرقية — مشروع الرفاه الوظيفي'
    ];
    return lines.join('\n');
  }

  // ===== زر: تحميل البطاقة =====
  downloadBtn.addEventListener('click', async () => {
    const label = downloadBtn.querySelector('span');
    const original = label ? label.textContent : '';
    downloadBtn.disabled = true;
    if (label) label.textContent = 'جاري التوليد…';
    try {
      const blob = await generateCardBlob();
      triggerDownload(blob, cardFileName());
      showToast('تم تحميل البطاقة بنجاح', 'success');
    } catch (err) {
      console.error('تعذر توليد البطاقة:', err);
      showToast('تعذّر توليد صورة البطاقة', 'error');
    } finally {
      downloadBtn.disabled = false;
      if (label) label.textContent = original;
    }
  });

  // ===== زر: إرسال عبر واتساب (مشاركة ذكية) =====
  whatsappBtn.addEventListener('click', async () => {
    const label = whatsappBtn.querySelector('span');
    const original = label ? label.textContent : '';
    whatsappBtn.disabled = true;
    if (label) label.textContent = 'جاري التجهيز…';
    try {
      const blob = await generateCardBlob();
      const file = new File([blob], cardFileName(), { type: 'image/png' });

      // (1) المشاركة الأصلية مع إرفاق الصورة (الأفضل على الجوال)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'مبادرة صديقي المهني',
            text: whatsappText()
          });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return; // ألغى المستخدم
          // غير ذلك: ننتقل لخطة واتساب النصية
        }
      }

      // (2) خطة بديلة: تنزيل الصورة + فتح واتساب برسالة نصية جاهزة
      triggerDownload(blob, cardFileName());
      const waUrl = 'https://wa.me/?text=' + encodeURIComponent(whatsappText());
      window.open(waUrl, '_blank', 'noopener');
      showToast('تم تنزيل البطاقة — أرفقها في محادثة واتساب', 'success');
    } catch (err) {
      console.error('تعذر المشاركة:', err);
      showToast('تعذّرت المشاركة عبر واتساب', 'error');
    } finally {
      whatsappBtn.disabled = false;
      if (label) label.textContent = original;
    }
  });

  // ===== إرسال النموذج =====
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();

    const result = validateForm();
    if (!result.ok) {
      showAlert('error', result.message);
      if (result.focus) {
        if (result.focus.scrollIntoView) {
          result.focus.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        try { result.focus.focus({ preventScroll: true }); } catch (_) {}
      }
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري الإنشاء…';

    const data = {
      organization:     form.organization.value,
      sender_name:      form.sender_name.value.trim(),
      recipient_name:   form.recipient_name.value.trim(),
      values:           getSelectedValues(),
      personal_message: form.personal_message.value.trim() || null
    };

    const payload = {
      p_organization:     data.organization,
      p_sender_name:      data.sender_name,
      p_recipient_name:   data.recipient_name,
      p_values:           data.values,
      p_personal_message: data.personal_message
    };

    try {
      const { error } = await supabase.rpc('submit_friend_card', payload);
      if (error) throw error;

      // نجاح: تعبئة البطاقة وإظهار شاشة النجاح
      renderCard(data);
      formCard.style.display = 'none';
      successCard.style.display = 'block';
      successCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      console.error('خطأ في إنشاء البطاقة:', err);
      showAlert(
        'error',
        'تعذر إنشاء البطاقة. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.'
      );
      submitBtn.disabled = false;
      submitBtn.textContent = 'إنشاء البطاقة';
    }
  });

  // ===== زر: بطاقة جديدة =====
  newResponseBtn.addEventListener('click', () => {
    successCard.style.display = 'none';
    formCard.style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = 'إنشاء البطاقة';
    form.reset();
    clearAlert();
    clearInvalid();
    cardBlob = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ===== Toast خفيف =====
  function showToast(message, type) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast' + (type === 'error' ? ' toast--error' : ' toast--success');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const iconSvg = type === 'error'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

    toast.innerHTML = iconSvg + '<span>' + message + '</span>';
    document.body.appendChild(toast);
    void toast.offsetWidth;
    toast.classList.add('is-visible');

    setTimeout(() => {
      toast.classList.remove('is-visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 2600);
  }

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
