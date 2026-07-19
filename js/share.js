(function () {
  'use strict';

  const shareBtn = document.getElementById('share-btn');
  if (!shareBtn) return;

  const shareData = {
    title: document.title,
    text: 'مبادرة صديقي المهني — لأن الكلمة الطيبة قيمة مؤسسية. وجّه رسالة تقدير إلى زميلك الذي أثّر في رحلتك المهنية.',
    url: window.location.href
  };

  shareBtn.addEventListener('click', async () => {
    // (1) Web Share API (الطريقة الأصلية على الموبايل)
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // أغلق المستخدم النافذة
        // وإلا انتقل للنسخ
      }
    }

    // (2) Fallback: نسخ الرابط للحافظة
    try {
      await navigator.clipboard.writeText(shareData.url);
      showToast('تم نسخ رابط الاستبيان', 'success');
    } catch {
      // (3) Fallback أخير: تحديد النص ودعوة المستخدم لنسخه
      const ta = document.createElement('textarea');
      ta.value = shareData.url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showToast('تم نسخ رابط المبادرة', 'success');
      } catch {
        showToast('تعذّر مشاركة الرابط', 'error');
      }
      document.body.removeChild(ta);
    }
  });

  function showToast(message, type) {
    // إزالة أي toast سابقة
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast' + (type === 'error' ? ' toast--error' : ' toast--success');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    // أيقونة + نص
    const iconSvg = type === 'error'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

    toast.innerHTML = iconSvg + '<span>' + message + '</span>';
    document.body.appendChild(toast);

    // إجبار reflow ثم إضافة الفئة لتشغيل transition
    void toast.offsetWidth;
    toast.classList.add('is-visible');

    setTimeout(() => {
      toast.classList.remove('is-visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 2400);
  }
})();
