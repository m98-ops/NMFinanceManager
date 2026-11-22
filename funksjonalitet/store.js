(() => {
  'use strict';

  const SUPABASE_URL = 'https://nbrqtupxrlrfhwodigou.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_NO14aKeYWxfzU5xpKxSc-w_7UpD7909';

  const CATEGORIES = ['Mat', 'Bolig', 'Transport', 'Regninger', 'Helse', 'Fritid', 'Shopping', 'Sparing', 'Annet'];
  const MONTHS = [
    ['01', 'Januar'], ['02', 'Februar'], ['03', 'Mars'], ['04', 'April'],
    ['05', 'Mai'], ['06', 'Juni'], ['07', 'Juli'], ['08', 'August'],
    ['09', 'September'], ['10', 'Oktober'], ['11', 'November'], ['12', 'Desember']
  ];

  const $ = id => document.getElementById(id);
  const hideEl = (el, hide) => el?.classList.toggle('hidden', hide);
  const money = v => `${new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} kr`;
  const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const nextDate = s => { const d = parseDate(s); d.setDate(d.getDate() + 1); return fmtDate(d); };
  const today = () => fmtDate(new Date());
  const monthName = m => MONTHS.find(([v]) => v === m)?.[1] || m;
  const fmtDDMM = s => { if (!s) return ''; const [, m, d] = s.slice(0, 10).split('-'); return `${d}/${m}`; };

  const cycleRange = (yStr, mStr) => {
    const y = Number(yStr), mIdx = Number(mStr) - 1;
    return { start: fmtDate(new Date(y, mIdx - 1, 25)), end: fmtDate(new Date(y, mIdx, 25)) };
  };

  const activeCycle = () => {
    const now = new Date();
    const t = new Date(now.getFullYear(), now.getDate() <= 25 ? now.getMonth() : now.getMonth() + 1, 1);
    const y = t.getFullYear(), m = String(t.getMonth() + 1).padStart(2, '0');
    return { year: y, month: m, range: cycleRange(y, m) };
  };

  const state = { user: null, budgets: [], selected: '', offset: 0, revision: 0, memberNames: [], editingBudgetId: null };
  const statusTimers = new Map();

  const clearStatus = (target = 'app-message') => {
    clearTimeout(statusTimers.get(target));
    statusTimers.delete(target);
    const el = $(target);
    if (el) { el.textContent = ''; el.className = 'message hidden'; }
  };

  const status = (text, type = 'error', target = 'app-message') => {
    const el = $(target);
    if (!el) return;
    clearStatus(target);
    el.textContent = text;
    el.className = `message ${type}`;
    statusTimers.set(target, setTimeout(() => clearStatus(target), 10000));
  };

  window.NMStore = {
    db: window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY),
    CATEGORIES, MONTHS, $, hideEl, money, fmtDate, parseDate, nextDate, today, monthName, fmtDDMM,
    cycleRange, activeCycle, state, clearStatus, status
  };
})();