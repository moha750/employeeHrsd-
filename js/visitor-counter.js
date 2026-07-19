// ============================================================
// عدّاد زوار الموقع — تسجيل/عرض
// ============================================================
(function () {
  'use strict';

  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || config.url.includes('YOUR_PROJECT_ID')) return;

  const supabase = window.supabase.createClient(config.url, config.anonKey);

  const counterEl = document.getElementById('visitor-counter');
  const valueEl   = document.getElementById('visitor-counter-value');
  if (!counterEl || !valueEl) return;

  const SESSION_KEY = 'hrsd_visit_counted';

  function show(n) {
    valueEl.textContent = formatNumber(n);
    counterEl.hidden = false;
  }

  function formatNumber(n) {
    return Number(n).toLocaleString('ar-SA');
  }

  async function init() {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) {
        const { data, error } = await supabase
          .from('site_stats')
          .select('value')
          .eq('key', 'visitors')
          .single();
        if (error) throw error;
        show(data.value);
        return;
      }

      const { data, error } = await supabase.rpc('increment_visitor_count');
      if (error) throw error;
      sessionStorage.setItem(SESSION_KEY, '1');
      show(data);
    } catch (e) {
      counterEl.hidden = true;
      console.warn('visitor-counter:', e.message || e);
    }
  }

  init();
})();
