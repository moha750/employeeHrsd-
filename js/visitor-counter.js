// ============================================================
// عدّاد الزوار — تسجيل/عرض
// ------------------------------------------------------------
// لكل استبيان عدّاده المستقل. صفحة الاستبيان تحمل
// data-scope="survey" على عنصر العدّاد، فينتظر حتى تُحدّد
// صفحة الاستبيان أيَّ استبيان تعرض ثم يعدّ له وحده.
// أما بقية الصفحات فتعدّ للموقع كما كانت.
// ============================================================
(function () {
  'use strict';

  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || config.url.includes('YOUR_PROJECT_ID')) return;

  const supabase = window.supabase.createClient(config.url, config.anonKey);

  const counterEl = document.getElementById('visitor-counter');
  const valueEl   = document.getElementById('visitor-counter-value');
  if (!counterEl || !valueEl) return;

  function show(n) {
    valueEl.textContent = Number(n).toLocaleString('ar-SA');
    counterEl.hidden = false;
  }

  // مفتاح الصف في site_stats، ومفتاح الجلسة المقابل له
  function statsKey(slug) { return slug ? 'survey:' + slug : 'visitors'; }
  function sessionKey(slug) { return 'hrsd_visit_counted:' + statsKey(slug); }

  async function count(slug) {
    try {
      // زيارة محسوبة في هذه الجلسة: نعرض الرقم بلا زيادة
      if (sessionStorage.getItem(sessionKey(slug))) {
        const { data, error } = await supabase
          .from('site_stats')
          .select('value')
          .eq('key', statsKey(slug))
          .maybeSingle();
        if (error) throw error;
        show(data ? data.value : 0);
        return;
      }

      const { data, error } = await supabase.rpc('increment_visits', {
        p_slug: slug || null
      });
      if (error) throw error;
      sessionStorage.setItem(sessionKey(slug), '1');
      show(data);
    } catch (e) {
      counterEl.hidden = true;
      console.warn('visitor-counter:', e.message || e);
    }
  }

  if (counterEl.dataset.scope === 'survey') {
    // ننتظر صفحة الاستبيان حتى تحسم أيَّ استبيان تعرض
    window.addEventListener('hrsd:survey-ready', ev => {
      count(ev.detail && ev.detail.slug);
    }, { once: true });
  } else {
    count(null);
  }
})();
