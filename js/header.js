(function () {
  'use strict';

  if (typeof IntersectionObserver === 'undefined') return;

  const hero = document.querySelector('.site-header');
  const bar  = document.querySelector('.sticky-bar');
  const logo = document.querySelector('.site-logo');

  // (1) شريط Sticky عند الخروج من الترويسة
  if (hero && bar) {
    const stickyObserver = new IntersectionObserver(
      ([entry]) => {
        // الترويسة بلا أبعاد (display:none/مخفية)؟ لا تُظهر الشريط
        if (entry.boundingClientRect.height === 0) {
          bar.classList.remove('is-visible');
          return;
        }
        bar.classList.toggle('is-visible', !entry.isIntersecting);
      },
      { rootMargin: '-40px 0px 0px 0px', threshold: 0 }
    );
    stickyObserver.observe(hero);
  }

  // (2) إعادة تشغيل أنميشن الشعار في كل مرة يدخل فيها الـ viewport
  if (logo) {
    const logoObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // إعادة تشغيل الأنميشن عبر إزالة ثم إضافة الفئة (مع force reflow)
          logo.classList.remove('is-active');
          // قراءة خاصية تخطيطية لإجبار المتصفح على تحديث الـ DOM قبل إضافة الفئة
          void logo.offsetWidth;
          logo.classList.add('is-active');
        } else {
          logo.classList.remove('is-active');
        }
      },
      { threshold: 0.25 }
    );
    logoObserver.observe(logo);
  }
})();
