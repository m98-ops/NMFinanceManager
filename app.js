const SUPABASE_URL = 'https://nbrqtupxrlrfhwodigou.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NO14aKeYWxfzU5xpKxSc-w_7UpD7909';

// Global funksjon for å bytte view
window.switchView = (viewName) => {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    const targetView = item.dataset.view || (item.getAttribute('onclick')?.match(/switchView\('([^']+)'\)/)?.[1]);
    if (targetView === viewName) {
      item.classList.add('active');
    }
  });

  document.querySelectorAll('.view-content').forEach(c => {
    c.classList.remove('active');
    c.classList.add('hidden');
  });

  const target = document.getElementById(`view-${viewName}`);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }

  const drawer = document.getElementById('mobile-drawer');
  const backdrop = document.getElementById('mobile-drawer-backdrop');
  if (drawer && backdrop) {
    drawer.classList.add('hidden');
    backdrop.classList.add('hidden');
  }

  if (window.innerWidth < 768) {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
};

(() => {
  'use strict';

  const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);

  const categories = ['Mat', 'Bolig', 'Transport', 'Regninger', 'Helse', 'Fritid', 'Shopping', 'Sparing', 'Annet'];
  const monthNames = [
    { value: '01', label: 'Januar' },
    { value: '02', label: 'Februar' },
    { value: '03', label: 'Mars' },
    { value: '04', label: 'April' },
    { value: '05', label: 'Mai' },
    { value: '06', label: 'Juni' },
    { value: '07', label: 'Juli' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'Oktober' },
    { value: '11', label: 'November' },
    { value: '12', label: 'Desember' }
  ];

  const money = value => `${new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} kr`;
  const dateString = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

  const formatDateNO = s => {
    if (!s) return '';
    const [y, m, d] = s.slice(0, 10).split('-');
    if (!y || !m || !d) return s;
    return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
  };

  const nextDate = s => { const d = parseDate(s); d.setDate(d.getDate() + 1); return dateString(d); };
  const today = () => dateString(new Date());

  const cycleRangeFromYearMonth = (yearStr, monthStr) => {
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    const start = dateString(new Date(year, monthIndex - 1, 25));
    const end = dateString(new Date(year, monthIndex, 25));
    return { start, end };
  };

  const activeForwardCycle = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const targetMonthIndex = now.getDate() <= 25 ? m : m + 1;
    const targetDate = new Date(y, targetMonthIndex, 1);
    return {
      year: targetDate.getFullYear(),
      month: String(targetDate.getMonth() + 1).padStart(2, '0'),
      range: cycleRangeFromYearMonth(targetDate.getFullYear(), targetDate.getMonth() + 1)
    };
  };

  const anchor25MonthIndex = budget => {
    const d = parseDate(budget.first_start);
    return d.getDate() > 25 ? (d.getFullYear() * 12 + d.getMonth() + 1) : (d.getFullYear() * 12 + d.getMonth());
  };

  const period = (budget, offset) => {
    const endMonthTotal = anchor25MonthIndex(budget) + offset;
    const endYear = Math.floor(endMonthTotal / 12);
    const endMonthIdx = endMonthTotal % 12;
    return {
      start: dateString(new Date(endYear, endMonthIdx - 1, 25)),
      end: dateString(new Date(endYear, endMonthIdx, 25))
    };
  };

  const thisPeriod = budget => {
    const active = activeForwardCycle();
    const activeEndMonthTotal = active.year * 12 + (Number(active.month) - 1);
    return Math.max(0, activeEndMonthTotal - anchor25MonthIndex(budget));
  };

  const state = { user: null, budgets: [], selected: '', offset: 0, revision: 0, memberNames: [] };
  const getBudget = id => state.budgets.find(b => b.id === id);

  function status(text, type = 'error', target = 'app-message') {
    const el = $(target);
    if (!el) return;
    el.textContent = text;
    el.className = `message ${type}`;
  }

  function clearStatus(target = 'app-message') {
    const el = $(target);
    if (el) {
      el.textContent = '';
      el.className = 'message hidden';
    }
  }

  function populateYearAndMonthSelects() {
    const yearSelect = $('dashboard-year');
    const monthSelect = $('dashboard-month');
    const active = activeForwardCycle();

    if (yearSelect) {
      yearSelect.replaceChildren();
      for (let y = active.year - 3; y <= active.year + 2; y++) {
        yearSelect.add(new Option(String(y), String(y)));
      }
      yearSelect.value = String(active.year);
    }

    if (monthSelect) {
      monthSelect.replaceChildren();
      for (const m of monthNames) {
        monthSelect.add(new Option(m.label, m.value));
      }
      monthSelect.value = active.month;
    }
  }

  function apply25CycleToBudgetForm() {
    const { range } = activeForwardCycle();
    if ($('budget-start')) $('budget-start').value = range.start;
    if ($('budget-end')) $('budget-end').value = range.end;
  }

  function setDrawerOpen(open) {
    const drawer = $('mobile-drawer');
    const backdrop = $('mobile-drawer-backdrop');
    if (!drawer || !backdrop) return;
    drawer.classList.toggle('hidden', !open);
    backdrop.classList.toggle('hidden', !open);
  }

  function setBudgetDropdownOpen(open, scope = 'both') {
    const targets = scope === 'sidebar'
      ? [['sidebar-budget-dropdown-btn', 'sidebar-budget-dropdown']]
      : scope === 'mobile'
        ? [['mobile-budget-dropdown-btn', 'mobile-budget-dropdown']]
        : [
            ['sidebar-budget-dropdown-btn', 'sidebar-budget-dropdown'],
            ['mobile-budget-dropdown-btn', 'mobile-budget-dropdown']
          ];

    for (const [btnId, listId] of targets) {
      const btn = $(btnId);
      const list = $(listId);
      if (btn) btn.setAttribute('aria-expanded', String(open));
      if (list) list.classList.toggle('hidden', !open);
    }
  }

  function renderBudgetDropdowns() {
    const dropdownIds = ['sidebar-budget-dropdown', 'mobile-budget-dropdown'];
    for (const id of dropdownIds) {
      const list = $(id);
      if (!list) continue;
      list.replaceChildren();

      if (!state.budgets.length) {
        const li = document.createElement('li');
        li.className = 'dropdown-empty';
        li.textContent = 'Ingen budsjetter';
        list.append(li);
        continue;
      }

      for (const b of state.budgets) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `nav-dropdown-item${state.selected === b.id ? ' selected' : ''}`;

        const titleSpan = document.createElement('span');
        titleSpan.textContent = b.name;

        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'nav-dropdown-badge';
        badgeSpan.textContent = b.kind === 'shared' ? 'Felles' : 'Personlig';

        btn.append(titleSpan, badgeSpan);
        btn.addEventListener('click', () => {
          selectBudget(b.id);
          renderBudgetDropdowns();
          switchView('history');
        });

        li.append(btn);
        list.append(li);
      }
    }
  }

  function setOptions() {
    const old = $('trans-budget')?.value || '';
    for (const id of ['selected-budget', 'trans-budget']) {
      const el = $(id);
      if (!el) continue;
      el.replaceChildren(new Option(id === 'trans-budget' ? 'Uten budsjett' : 'Velg budsjett', ''));
      state.budgets.forEach(b => el.add(new Option(`${b.name} (${b.kind === 'shared' ? 'felles' : 'personlig'})`, b.id)));
    }
    if ($('selected-budget')) $('selected-budget').value = state.selected;
    if ($('trans-budget')) $('trans-budget').value = state.selected || old;
    if ($('trans-budget') && !$('trans-budget').value && $('trans-scope')) $('trans-scope').value = 'personal';
    updateScope();
    renderBudgetDropdowns();
  }

  function updateScope() {
    const b = getBudget($('trans-budget')?.value);
    const scopeSelect = $('trans-scope');
    if (scopeSelect && !b) {
      scopeSelect.value = 'personal';
    }
  }

  function showAuth() {
    state.revision++;
    state.user = null;
    state.budgets = [];
    state.selected = '';
    state.memberNames = [];
    document.body.classList.remove('is-authenticated');
    setDrawerOpen(false);
    setBudgetDropdownOpen(false);
    $('auth-section')?.classList.remove('hidden');
    $('app-section')?.classList.add('hidden');
    $('mobile-header')?.classList.add('hidden');
    if ($('transactions-list')) $('transactions-list').replaceChildren();
    if ($('budget-list')) $('budget-list').replaceChildren();
    if ($('member-spending-grid')) $('member-spending-grid').replaceChildren();
    renderBudgetDropdowns();
    switchView('dashboard');
  }

  async function showApp(user) {
    state.user = user;
    document.body.classList.add('is-authenticated');
    $('auth-section')?.classList.add('hidden');
    $('app-section')?.classList.remove('hidden');
    $('mobile-header')?.classList.remove('hidden');
    const name = user.user_metadata?.first_name || user.email;
    if ($('user-name-sidebar')) $('user-name-sidebar').textContent = name;
    if ($('user-name-mobile')) $('user-name-mobile').textContent = name;
    await loadBudgets();
    switchView('dashboard');
  }

  async function fetchAll(table, columns, filters) {
    const rows = [];
    for (let from = 0; ; from += 500) {
      let q = db.from(table).select(columns);
      q = filters(q).range(from, from + 499);
      const { data, error } = await q;
      if (error) throw error;
      rows.push(...data);
      if (data.length < 500) return rows;
    }
  }

  async function loadBudgets() {
    if (!state.user) return;
    const revision = ++state.revision;
    try {
      const { data, error } = await db
        .from('budgets')
        .select('id,created_by,title,total_amount,start_date,end_date,kind')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (revision !== state.revision) return;
      state.budgets = data.map(row => ({
        ...row,
        owner_id: row.created_by,
        name: row.title,
        amount_limit: row.total_amount,
        first_start: row.start_date,
        first_end: row.end_date
      }));
      if (!getBudget(state.selected)) {
        state.selected = '';
        state.offset = 0;
      }
      setOptions();
      renderBudgetList();
      await refresh();
    } catch (err) {
      if (revision === state.revision) status(`Kunne ikke hente budsjetter: ${err.message}`);
    }
  }

  function renderBudgetList() {
    const list = $('budget-list');
    if (!list) return;
    list.replaceChildren();
    if (!state.budgets.length) {
      const li = document.createElement('li');
      li.textContent = 'Ingen budsjetter ennå. Opprett ett over.';
      list.append(li);
      return;
    }
    for (const b of state.budgets) {
      const li = document.createElement('li');
      const content = document.createElement('div');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'budget-button';
      button.textContent = b.name;
      button.addEventListener('click', () => {
        selectBudget(b.id);
        switchView('history');
      });
      const r = period(b, thisPeriod(b));
      const meta = document.createElement('small');
      meta.className = 'row-meta';
      meta.textContent = `${b.kind === 'shared' ? 'Felles' : 'Personlig'} · ${formatDateNO(r.start)} – ${formatDateNO(r.end)}`;
      content.append(button, meta);

      const amount = document.createElement('strong');
      amount.className = 'amount';
      amount.textContent = money(Number(b.amount_limit));
      li.append(content, amount);
      list.append(li);
    }
  }

  function selectBudget(id) {
    state.selected = id;
    state.memberNames = [];
    const b = getBudget(id);
    state.offset = b ? thisPeriod(b) : 0;
    if ($('selected-budget')) $('selected-budget').value = id;
    if ($('trans-budget') && id) $('trans-budget').value = id;
    if ($('share-input-drawer')) $('share-input-drawer').classList.add('hidden');
    updateScope();
    renderBudgetDropdowns();
    refresh();
  }

  function renderMemberSpending(b, records) {
    const grid = $('member-spending-grid');
    if (!grid || !b) return;
    grid.replaceChildren();

    const currentUserLabel = state.user.user_metadata?.first_name || state.user.email || 'Meg';
    const totalsByMember = new Map();

    const addMember = label => {
      const clean = (label || '').trim();
      if (!clean) return;
      if (!totalsByMember.has(clean)) totalsByMember.set(clean, 0);
    };

    if (b.owner_id === state.user.id) {
      addMember(currentUserLabel);
    }
    for (const memberName of state.memberNames) {
      addMember(memberName);
    }

    const budgetRecords = records.filter(t => t.budget_id === b.id);
    for (const t of budgetRecords) {
      const memberLabel = t.actor_name
        || (t.user_id === state.user.id ? currentUserLabel : 'Medlem');
      totalsByMember.set(memberLabel, (totalsByMember.get(memberLabel) || 0) + Number(t.amount));
    }

    if (!totalsByMember.size) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'Ingen medlemmer eller betalinger registrert i denne perioden.';
      grid.append(empty);
      return;
    }

    const sortedMembers = [...totalsByMember.entries()].sort((a, bEntry) => bEntry[1] - aEntry[1]);
    sortedMembers.forEach(([memberLabel, sum], idx) => {
      const card = document.createElement('div');
      card.className = `member-stat-card${idx === 0 ? ' highlight' : ''}`;

      const labelEl = document.createElement('span');
      labelEl.className = 'stat-label';
      labelEl.textContent = memberLabel;

      const valueEl = document.createElement('span');
      valueEl.className = 'stat-value';
      valueEl.textContent = money(sum);

      card.append(labelEl, valueEl);
      grid.append(card);
    });
  }

  function displayDetail(b, records) {
    if (!$('budget-detail')) return;
    $('budget-detail').classList.toggle('hidden', !b);

    const canShare = Boolean(b && b.owner_id === state.user.id);
    if ($('share-outside-box')) $('share-outside-box').classList.toggle('hidden', !canShare);
    if (!canShare && $('share-input-drawer')) $('share-input-drawer').classList.add('hidden');
    if (!b) return;

    const r = period(b, state.offset);
    if ($('period-label')) $('period-label').textContent = `${formatDateNO(r.start)} – ${formatDateNO(r.end)}`;
    if ($('previous-period')) $('previous-period').disabled = state.offset === 0;
    const spent = records
      .filter(t => t.budget_id === b.id && (t.payment_scope === 'shared' || t.user_id === state.user.id))
      .reduce((sum, t) => sum + Number(t.amount), 0);
    if ($('budget-balance')) {
      $('budget-balance').textContent = `${money(spent)} av ${money(Number(b.amount_limit))} · ${money(Number(b.amount_limit) - spent)} igjen`;
    }
    renderMemberSpending(b, records);
  }

  async function loadMembers(b) {
    if (!b) return;
    const { data, error } = await db.from('budget_members').select('display_name').eq('budget_id', b.id);
    if (state.selected !== b.id) return;
    if (!error && Array.isArray(data)) {
      state.memberNames = data.map(m => m.display_name).filter(Boolean);
    }
    if ($('member-list')) {
      $('member-list').textContent = error
        ? `Kunne ikke hente medlemmer: ${error.message}`
        : `Delt med: ${data.length ? data.map(m => m.display_name).join(', ') : 'ingen ennå'}`;
    }
    await refresh();
  }

  function displayTransactions(records, selected) {
    const list = $('transactions-list');
    if (!list) return;
    list.replaceChildren();
    if (!records.length) {
      const li = document.createElement('li');
      li.textContent = 'Ingen betalinger i denne perioden.';
      list.append(li);
      return;
    }
    for (const t of records) {
      const li = document.createElement('li');
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = t.store_name;
      const meta = document.createElement('small');
      meta.className = 'row-meta';
      const b = getBudget(t.budget_id);
      meta.textContent = [
        formatDateNO(t.purchase_date),
        t.category,
        t.payment_scope === 'shared' ? 'Felles' : 'Personlig',
        b && !selected ? b.name : null,
        t.payment_scope === 'shared' ? `Registrert av ${t.actor_name}` : null,
        t.description
      ].filter(Boolean).join(' · ');
      info.append(title, meta);

      const amount = document.createElement('strong');
      amount.className = 'amount';
      amount.textContent = money(Number(t.amount));
      li.append(info, amount);
      list.append(li);
    }
  }

  function displayDashboard(records, cycleRange) {
    const personal = records.filter(t => t.payment_scope === 'personal');
    const shared = records.filter(t => t.payment_scope === 'shared');
    if ($('personal-total')) $('personal-total').textContent = money(personal.reduce((n, t) => n + Number(t.amount), 0));
    if ($('shared-total')) $('shared-total').textContent = money(shared.reduce((n, t) => n + Number(t.amount), 0));
    if ($('dashboard-cycle-label')) {
      $('dashboard-cycle-label').textContent = `Periode (25.–25.): ${formatDateNO(cycleRange.start)} – ${formatDateNO(cycleRange.end)}`;
    }

    const sums = new Map();
    for (const t of records) sums.set(t.category, (sums.get(t.category) || 0) + Number(t.amount));

    const list = $('category-totals');
    if (!list) return;
    list.replaceChildren();
    if (!sums.size) {
      const li = document.createElement('li');
      li.textContent = 'Ingen betalinger i denne perioden.';
      list.append(li);
      return;
    }
    for (const [name, value] of [...sums].sort((a, b) => b[1] - a[1])) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = name;
      const amount = document.createElement('strong');
      amount.textContent = money(value);
      li.append(label, amount);
      list.append(li);
    }
  }

  async function refresh() {
    if (!state.user) return;
    const revision = ++state.revision;
    const b = getBudget(state.selected);
    const active = activeForwardCycle();
    const yearVal = $('dashboard-year')?.value || String(active.year);
    const monthVal = $('dashboard-month')?.value || active.month;
    const cycle = cycleRangeFromYearMonth(yearVal, monthVal);
    const chosen = b && period(b, state.offset);
    const fields = 'id,user_id,budget_id,store_name,amount,category,payment_scope,actor_name,description,purchase_date,created_at';
    const fetchPeriod = (start, end, budgetId) => fetchAll('transactions', fields, q => {
      q = q.gte('purchase_date', start).lt('purchase_date', end).order('purchase_date', { ascending: false }).order('created_at', { ascending: false });
      return budgetId ? q.eq('budget_id', budgetId) : q;
    });

    try {
      const [cycleRows, periodRows, membersRes] = await Promise.all([
        fetchPeriod(cycle.start, nextDate(cycle.end)),
        chosen ? fetchPeriod(chosen.start, nextDate(chosen.end), b.id) : Promise.resolve([]),
        b ? db.from('budget_members').select('display_name').eq('budget_id', b.id) : Promise.resolve({ data: [], error: null })
      ]);
      if (revision !== state.revision) return;

      if (b && !membersRes.error && Array.isArray(membersRes.data)) {
        state.memberNames = membersRes.data.map(m => m.display_name).filter(Boolean);
        if ($('member-list')) {
          $('member-list').textContent = `Delt med: ${state.memberNames.length ? state.memberNames.join(', ') : 'ingen ennå'}`;
        }
      }

      displayDashboard(cycleRows, cycle);
      displayDetail(b, periodRows);
      displayTransactions(b ? periodRows : cycleRows, Boolean(b));
    } catch (err) {
      if (revision === state.revision) status(`Kunne ikke hente betalinger: ${err.message}`);
    }
  }

  function initialize() {
    populateYearAndMonthSelects();
    apply25CycleToBudgetForm();
    if ($('trans-date')) $('trans-date').value = today();

    if ($('trans-category')) {
      for (const category of categories) $('trans-category').add(new Option(category, category));
    }

    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        window.switchView(item.dataset.view);
      });
    });

    $('hamburger-btn')?.addEventListener('click', () => setDrawerOpen(true));
    $('mobile-drawer-close')?.addEventListener('click', () => setDrawerOpen(false));
    $('mobile-drawer-backdrop')?.addEventListener('click', () => setDrawerOpen(false));

    $('sidebar-toggle-btn')?.addEventListener('click', () => {
      const sidebar = $('sidebar');
      if (!sidebar) return;
      const willMinimize = !sidebar.classList.contains('minimized');
      sidebar.classList.toggle('minimized', willMinimize);
      document.body.classList.toggle('sidebar-minimized', willMinimize);
      if (willMinimize) setBudgetDropdownOpen(false, 'sidebar');
    });

    $('sidebar-budget-dropdown-btn')?.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const sidebar = $('sidebar');
      if (sidebar?.classList.contains('minimized')) {
        sidebar.classList.remove('minimized');
        document.body.classList.remove('sidebar-minimized');
        setBudgetDropdownOpen(true, 'sidebar');
        return;
      }
      const expanded = $('sidebar-budget-dropdown-btn')?.getAttribute('aria-expanded') === 'true';
      setBudgetDropdownOpen(!expanded, 'sidebar');
    });

    $('mobile-budget-dropdown-btn')?.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const expanded = $('mobile-budget-dropdown-btn')?.getAttribute('aria-expanded') === 'true';
      setBudgetDropdownOpen(!expanded, 'mobile');
    });

    $('toggle-share-input-btn')?.addEventListener('click', () => {
      const drawer = $('share-input-drawer');
      if (!drawer) return;
      drawer.classList.toggle('hidden');
      if (!drawer.classList.contains('hidden')) {
        $('share-identifier')?.focus();
      }
    });

    $('tab-login')?.addEventListener('click', () => {
      $('login-form')?.classList.remove('hidden');
      $('signup-form')?.classList.add('hidden');
      $('tab-login')?.classList.add('active');
      $('tab-signup')?.classList.remove('active');
      clearStatus('auth-error');
    });

    $('tab-signup')?.addEventListener('click', () => {
      $('signup-form')?.classList.remove('hidden');
      $('login-form')?.classList.add('hidden');
      $('tab-signup')?.classList.add('active');
      $('tab-login')?.classList.remove('active');
      clearStatus('auth-error');
    });

    if (!db) {
      status('Kunne ikke laste Supabase.', 'error', 'auth-error');
      return;
    }

    $('signup-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      clearStatus('auth-error');
      try {
        const { data, error } = await db.auth.signUp({
          email: $('signup-email').value.trim(),
          password: $('signup-password').value,
          options: {
            data: {
              first_name: $('signup-firstname').value.trim(),
              last_name: $('signup-lastname').value.trim(),
              username: $('signup-username').value.trim()
            }
          }
        });
        if (error) return status(`Registrering feilet: ${error.message}`, 'error', 'auth-error');
        $('signup-form').reset();
        if (!data.session) {
          $('tab-login')?.click();
          status('Konto opprettet. Bekreft e-posten før du logger inn.', 'success', 'auth-error');
        }
      } catch (err) {
        status(`Registrering feilet: ${err?.message || 'Nettverksfeil'}`, 'error', 'auth-error');
      }
    });

    $('login-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      clearStatus('auth-error');
      try {
        const { error } = await db.auth.signInWithPassword({
          email: $('login-email').value.trim(),
          password: $('login-password').value
        });
        if (error) {
          const msg = error.message === 'Invalid login credentials'
            ? 'Feil e-post eller passord.'
            : error.message;
          status(`Innlogging feilet: ${msg}`, 'error', 'auth-error');
        }
      } catch (err) {
        status('Innlogging feilet: Kunne ikke nå serveren. Sjekk nettverket ditt.', 'error', 'auth-error');
      }
    });

    const handleLogout = async () => {
      const { error } = await db.auth.signOut();
      if (error) status(error.message);
    };
    $('logout-btn-sidebar')?.addEventListener('click', handleLogout);
    $('logout-btn-mobile')?.addEventListener('click', handleLogout);

    $('set-25-cycle-btn')?.addEventListener('click', () => {
      apply25CycleToBudgetForm();
      status('Datoene er satt til 25. – 25.', 'success');
    });

    $('budget-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      clearStatus();
      const start = $('budget-start').value;
      const end = $('budget-end').value;
      if (!start || !end || end <= start) {
        return status('Sluttdato må være etter startdato.');
      }
      const { data, error } = await db.from('budgets').insert({
        created_by: state.user.id,
        title: $('budget-name').value.trim(),
        total_amount: Number($('budget-limit').value),
        start_date: start,
        end_date: end,
        kind: $('budget-type').value
      }).select('id').single();

      if (error) return status(`Kunne ikke opprette budsjett: ${error.message}`);
      $('budget-form').reset();
      apply25CycleToBudgetForm();
      await loadBudgets();
      selectBudget(data.id);
      status('Budsjettet er opprettet.', 'success');
      switchView('budgets');
    });

    $('selected-budget')?.addEventListener('change', event => selectBudget(event.target.value));
    $('trans-budget')?.addEventListener('change', updateScope);
    $('previous-period')?.addEventListener('click', () => { state.offset = Math.max(0, state.offset - 1); refresh(); });
    $('next-period')?.addEventListener('click', () => { state.offset++; refresh(); });
    $('dashboard-year')?.addEventListener('change', refresh);
    $('dashboard-month')?.addEventListener('change', refresh);

    $('share-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      clearStatus();
      const b = getBudget(state.selected);
      if (!b || b.owner_id !== state.user?.id) return;

      const identifiers = $('share-identifier').value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      if (!identifiers.length) return;

      const added = [];
      for (const identifier of identifiers) {
        const { data, error } = await db.rpc('add_budget_member', {
          p_budget: b.id,
          p_identifier: identifier
        });
        if (error) return status(`Kunne ikke dele med ${identifier}: ${error.message}`);
        added.push(data);
      }

      $('share-form').reset();
      $('share-input-drawer')?.classList.add('hidden');
      status(`Lagt til: ${added.join(', ')}`, 'success');
      loadMembers(b);
    });

    $('transaction-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      clearStatus();
      const b = getBudget($('trans-budget').value);
      const scope = $('trans-scope').value;
      if (b && $('trans-date').value < b.first_start) {
        return status('Betalingsdato er før budsjettets første periode.');
      }
      const { error } = await db.from('transactions').insert({
        user_id: state.user.id,
        budget_id: b?.id || null,
        store_name: $('trans-store').value.trim(),
        amount: Number($('trans-amount').value),
        description: $('trans-desc').value.trim() || null,
        purchase_date: $('trans-date').value,
        category: $('trans-category').value,
        payment_scope: scope
      });
      if (error) return status(`Kunne ikke lagre betaling: ${error.message}`);
      $('transaction-form').reset();
      $('trans-date').value = today();
      $('trans-budget').value = b?.id || '';
      updateScope();
      status('Betalingen er lagret.', 'success');
      await refresh();
      switchView('history');
    });

    db.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id;
      if (!id) {
        if (state.user) showAuth();
        return;
      }
      if (id !== state.user?.id) setTimeout(() => showApp(session.user), 0);
      else state.user = session.user;
    });

    db.auth.getSession().then(({ data, error }) => {
      if (error) {
        return status(`Kunne ikke hente økt: ${error.message}`, 'error', 'auth-error');
      }
      if (data.session?.user && !state.user) {
        showApp(data.session.user);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();