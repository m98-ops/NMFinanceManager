const SUPABASE_URL = 'https://nbrqtupxrlrfhwodigou.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NO14aKeYWxfzU5xpKxSc-w_7UpD7909';

window.switchView = viewName => {
  document.querySelectorAll('.nav-item').forEach(item => {
    const targetView = item.dataset.view || item.getAttribute('onclick')?.match(/switchView\('([^']+)'\)/)?.[1];
    item.classList.toggle('active', targetView === viewName);
  });

  document.querySelectorAll('.view-content').forEach(c => {
    const isMatch = c.id === `view-${viewName}`;
    c.classList.toggle('active', isMatch);
    c.classList.toggle('hidden', !isMatch);
  });

  document.getElementById('mobile-drawer')?.classList.add('hidden');
  document.getElementById('mobile-drawer-backdrop')?.classList.add('hidden');
  if (window.innerWidth < 768) window.scrollTo({ top: 0, behavior: 'instant' });
};

(() => {
  'use strict';

  const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  const toggleHidden = (el, hide) => el?.classList.toggle('hidden', hide);

  const categories = ['Mat', 'Bolig', 'Transport', 'Regninger', 'Helse', 'Fritid', 'Shopping', 'Sparing', 'Annet'];
  const monthNames = [
    ['01', 'Januar'], ['02', 'Februar'], ['03', 'Mars'], ['04', 'April'],
    ['05', 'Mai'], ['06', 'Juni'], ['07', 'Juli'], ['08', 'August'],
    ['09', 'September'], ['10', 'Oktober'], ['11', 'November'], ['12', 'Desember']
  ];

  const money = v => `${new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} kr`;
  const dateString = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const nextDate = s => { const d = parseDate(s); d.setDate(d.getDate() + 1); return dateString(d); };
  const today = () => dateString(new Date());
  const monthLabel = mStr => monthNames.find(([v]) => v === mStr)?.[1] || mStr;

  const formatMonthYearFromDate = dateStr => {
    if (!dateStr) return '';
    const [y, m] = dateStr.slice(0, 10).split('-');
    return `${monthLabel(m)} ${y}`;
  };

  const cycleRangeFromYearMonth = (yearStr, monthStr) => {
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    return {
      start: dateString(new Date(year, monthIndex - 1, 25)),
      end: dateString(new Date(year, monthIndex, 25))
    };
  };

  const activeForwardCycle = () => {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getDate() <= 25 ? now.getMonth() : now.getMonth() + 1, 1);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, '0');
    return { year: y, month: m, range: cycleRangeFromYearMonth(y, m) };
  };

  const anchor25MonthIndex = b => {
    const d = parseDate(b.first_start);
    return d.getDate() > 25 ? d.getFullYear() * 12 + d.getMonth() + 1 : d.getFullYear() * 12 + d.getMonth();
  };

  const period = (b, offset) => {
    const total = anchor25MonthIndex(b) + offset;
    const endYear = Math.floor(total / 12);
    const endMonthIdx = total % 12;
    return {
      start: dateString(new Date(endYear, endMonthIdx - 1, 25)),
      end: dateString(new Date(endYear, endMonthIdx, 25)),
      label: `${monthLabel(String(endMonthIdx + 1).padStart(2, '0'))} ${endYear}`
    };
  };

  const thisPeriod = b => {
    const active = activeForwardCycle();
    return Math.max(0, (active.year * 12 + (Number(active.month) - 1)) - anchor25MonthIndex(b));
  };

  const state = {
    user: null,
    budgets: [],
    selected: '',
    offset: 0,
    revision: 0,
    memberNames: [],
    editingBudgetId: null
  };
  const getBudget = id => state.budgets.find(b => b.id === id);

  // Varsler med maks 10 sekunders varighet
  const statusTimers = new Map();

  function clearStatus(target = 'app-message') {
    const timer = statusTimers.get(target);
    if (timer) {
      clearTimeout(timer);
      statusTimers.delete(target);
    }
    const el = $(target);
    if (el) {
      el.textContent = '';
      el.className = 'message hidden';
    }
  }

  function status(text, type = 'error', target = 'app-message') {
    const el = $(target);
    if (!el) return;
    clearStatus(target);
    el.textContent = text;
    el.className = `message ${type}`;
    statusTimers.set(target, setTimeout(() => clearStatus(target), 10000));
  }

  async function toggleTransactionVippset(txId, checked) {
    if (!txId || !state.user) return false;
    const { error } = await db
      .from('transactions')
      .update({ is_vippset: checked })
      .eq('id', txId);

    if (error) {
      status(`Kunne ikke oppdatere Vipps-status: ${error.message}`);
      return false;
    }
    status(checked ? 'Markert som vippset.' : 'Vipps-markering fjernet.', 'success');
    await refresh();
    return true;
  }

  function syncUserDisplay() {
    if (!state.user) return;
    const meta = state.user.user_metadata || {};
    const name = meta.first_name || state.user.email;
    if ($('user-name-sidebar')) $('user-name-sidebar').textContent = name;
    if ($('user-name-mobile')) $('user-name-mobile').textContent = name;
    if ($('profile-email-display')) $('profile-email-display').textContent = state.user.email || '-';
    if ($('profile-id-display')) $('profile-id-display').textContent = state.user.id || '-';
    if ($('profile-firstname')) $('profile-firstname').value = meta.first_name || '';
    if ($('profile-lastname')) $('profile-lastname').value = meta.last_name || '';
    if ($('profile-username')) $('profile-username').value = meta.username || '';
  }

  async function openProfileView() {
    if (!state.user) return;
    syncUserDisplay();
    try {
      const { data } = await db.from('profiles').select('first_name,last_name,username').eq('id', state.user.id).maybeSingle();
      if (data) {
        if ($('profile-firstname') && data.first_name) $('profile-firstname').value = data.first_name;
        if ($('profile-lastname') && data.last_name) $('profile-lastname').value = data.last_name;
        if ($('profile-username') && data.username) $('profile-username').value = data.username;
      }
    } catch (_) {}
    window.switchView('profile');
  }

  function goToRegister(preselectBudgetId = '') {
    if (preselectBudgetId && $('trans-budget')) {
      $('trans-budget').value = preselectBudgetId;
    }
    window.switchView('register');
  }

  function populateDateSelects() {
    const active = activeForwardCycle();
    if ($('dashboard-year')) {
      $('dashboard-year').replaceChildren();
      for (let y = active.year - 3; y <= active.year + 2; y++) $('dashboard-year').add(new Option(String(y), String(y)));
      $('dashboard-year').value = String(active.year);
    }
    if ($('dashboard-month')) {
      $('dashboard-month').replaceChildren();
      monthNames.forEach(([val, lbl]) => $('dashboard-month').add(new Option(lbl, val)));
      $('dashboard-month').value = active.month;
    }
  }

  function apply25CycleToBudgetForm() {
    const { range } = activeForwardCycle();
    if ($('budget-start')) $('budget-start').value = range.start;
    if ($('budget-end')) $('budget-end').value = range.end;
  }

  function resetBudgetForm(closeDrawer = false) {
    state.editingBudgetId = null;
    $('budget-form')?.reset();
    apply25CycleToBudgetForm();
    if ($('budget-form-title')) $('budget-form-title').textContent = 'Opprett nytt budsjett';
    if ($('budget-submit-btn')) $('budget-submit-btn').textContent = 'Opprett budsjett';
    if (closeDrawer) toggleHidden($('new-budget-drawer'), true);
  }

  function startEditingBudget(budgetId) {
    const b = getBudget(budgetId);
    if (!b || b.owner_id !== state.user?.id) return;
    state.editingBudgetId = b.id;
    $('budget-name').value = b.name;
    $('budget-limit').value = String(Number(b.amount_limit));
    $('budget-start').value = b.first_start;
    $('budget-end').value = b.first_end;
    $('budget-type').value = b.kind;
    $('budget-form-title').textContent = `Endre budsjett: ${b.name}`;
    $('budget-submit-btn').textContent = 'Lagre endringer';
    toggleHidden($('new-budget-drawer'), false);
    window.switchView('budgets');
    $('budget-name')?.focus();
  }

  async function deleteBudgetById(budgetId) {
    const b = getBudget(budgetId);
    if (!b || b.owner_id !== state.user?.id) return;
    if (!window.confirm(`Er du sikker på at du vil slette budsjettet "${b.name}"?`)) return;

    clearStatus();
    const { error } = await db.from('budgets').delete().eq('id', b.id).eq('created_by', state.user.id);
    if (error) return status(`Kunne ikke slette budsjett: ${error.message}`);

    if (state.editingBudgetId === b.id) resetBudgetForm(true);
    if (state.selected === b.id) { state.selected = ''; state.offset = 0; }
    await loadBudgets();
    status(`Budsjettet "${b.name}" er slettet.`, 'success');
  }

  function setBudgetDropdownOpen(open, scope = 'both') {
    const pairs = [
      ['sidebar-budget-dropdown-btn', 'sidebar-budget-dropdown', 'sidebar'],
      ['mobile-budget-dropdown-btn', 'mobile-budget-dropdown', 'mobile']
    ];
    for (const [btnId, listId, sc] of pairs) {
      if (scope !== 'both' && scope !== sc) continue;
      $(btnId)?.setAttribute('aria-expanded', String(open));
      toggleHidden($(listId), !open);
    }
  }

  function renderBudgetDropdowns() {
    for (const id of ['sidebar-budget-dropdown', 'mobile-budget-dropdown']) {
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
        btn.innerHTML = `<span>${b.name}</span><span class="nav-dropdown-badge">${b.kind === 'shared' ? 'Felles' : 'Personlig'}</span>`;
        btn.addEventListener('click', () => { selectBudget(b.id); window.switchView('history'); });
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
    renderBudgetDropdowns();
  }

  function showAuth() {
    state.revision++;
    state.user = null;
    state.budgets = [];
    state.selected = '';
    state.memberNames = [];
    state.editingBudgetId = null;
    document.body.classList.remove('is-authenticated');
    setBudgetDropdownOpen(false);
    resetBudgetForm(true);
    toggleHidden($('auth-section'), false);
    toggleHidden($('app-section'), true);
    toggleHidden($('mobile-header'), true);
    $('transactions-list')?.replaceChildren();
    $('budget-list')?.replaceChildren();
    $('member-spending-grid')?.replaceChildren();
    $('debt-summary-list')?.replaceChildren();
    renderBudgetDropdowns();
    window.switchView('dashboard');
  }

  async function showApp(user) {
    state.user = user;
    document.body.classList.add('is-authenticated');
    toggleHidden($('auth-section'), true);
    toggleHidden($('app-section'), false);
    toggleHidden($('mobile-header'), false);
    syncUserDisplay();
    await loadBudgets();
    window.switchView('dashboard');
  }

  async function fetchAll(table, columns, filters) {
    const rows = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await filters(db.from(table).select(columns)).range(from, from + 499);
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
      if (!getBudget(state.selected)) { state.selected = ''; state.offset = 0; }
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
      li.textContent = 'Ingen budsjetter ennå. Trykk «Nytt budsjett» over for å opprette ett.';
      list.append(li);
      return;
    }

    for (const b of state.budgets) {
      const isOwner = b.owner_id === state.user?.id;
      const li = document.createElement('li');
      const content = document.createElement('div');
      const nameRow = document.createElement('div');
      nameRow.className = 'budget-name-row';

      let actionsMenu = null;
      if (isOwner) {
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'arrow-toggle-plain';
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.title = 'Flere valg';
        toggleBtn.innerHTML = '<span class="material-icons-outlined">expand_more</span>';

        actionsMenu = document.createElement('div');
        actionsMenu.className = 'budget-actions-under hidden';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn-mini';
        editBtn.textContent = 'Endre';
        editBtn.addEventListener('click', () => startEditingBudget(b.id));

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn-mini danger';
        delBtn.textContent = 'Slett';
        delBtn.addEventListener('click', () => deleteBudgetById(b.id));

        actionsMenu.append(editBtn, delBtn);

        toggleBtn.addEventListener('click', e => {
          e.stopPropagation();
          const willOpen = actionsMenu.classList.contains('hidden');
          document.querySelectorAll('.budget-actions-under').forEach(el => el.classList.add('hidden'));
          document.querySelectorAll('.arrow-toggle-plain').forEach(el => el.setAttribute('aria-expanded', 'false'));
          toggleHidden(actionsMenu, !willOpen);
          toggleBtn.setAttribute('aria-expanded', String(willOpen));
        });

        nameRow.append(toggleBtn);
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'budget-button';
      button.textContent = b.name;
      button.addEventListener('click', () => { selectBudget(b.id); window.switchView('history'); });
      nameRow.append(button);

      const p = period(b, thisPeriod(b));
      const meta = document.createElement('small');
      meta.className = `row-meta${isOwner ? ' indented' : ''}`;
      meta.textContent = `${b.kind === 'shared' ? 'Felles' : 'Personlig'} · ${isOwner ? 'Eier' : 'Medlem'} · ${p.label}`;

      content.append(nameRow, meta);
      if (actionsMenu) content.append(actionsMenu);

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
    toggleHidden($('share-input-drawer'), true);
    toggleHidden($('selected-budget-actions-menu'), true);
    $('selected-budget-actions-toggle')?.setAttribute('aria-expanded', 'false');
    renderBudgetDropdowns();
    refresh();
  }

  function isSharedBudgetTx(t) {
    const b = getBudget(t.budget_id);
    return t.payment_scope === 'shared' || b?.kind === 'shared';
  }

  function renderMemberSpending(b, records) {
    const grid = $('member-spending-grid');
    if (!grid || !b) return;
    grid.replaceChildren();

    const meta = state.user.user_metadata || {};
    const currentUserLabel = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim() || meta.first_name || state.user.email || 'Meg';
    const firstClean = (meta.first_name || '').trim().toLowerCase();
    const canonicalName = label => {
      const clean = (label || '').trim();
      return clean && firstClean && clean.toLowerCase() === firstClean ? currentUserLabel : clean;
    };

    const totals = new Map();
    const addMember = label => { const k = canonicalName(label); if (k && !totals.has(k)) totals.set(k, 0); };
    if (b.owner_id === state.user.id) addMember(currentUserLabel);
    state.memberNames.forEach(addMember);

    records.filter(t => t.budget_id === b.id).forEach(t => {
      const k = canonicalName(t.user_id === state.user.id ? (t.actor_name || currentUserLabel) : (t.actor_name || 'Medlem'));
      if (k) totals.set(k, (totals.get(k) || 0) + Number(t.amount));
    });

    if (!totals.size) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Ingen medlemmer eller betalinger registrert i denne perioden.';
      grid.append(p);
      return;
    }

    [...totals.entries()].sort((a, b) => b[1] - a[1]).forEach(([lbl, sum], idx) => {
      const card = document.createElement('div');
      card.className = `member-stat-card${idx === 0 ? ' highlight' : ''}`;
      card.innerHTML = `<span class="stat-label">${lbl}</span><span class="stat-value">${money(sum)}</span>`;
      grid.append(card);
    });
  }

  function displayDetail(b, records) {
    if (!$('budget-detail')) return;
    toggleHidden($('budget-detail'), !b);
    const isOwner = Boolean(b && b.owner_id === state.user.id);
    toggleHidden($('selected-budget-actions-toggle'), !isOwner);
    toggleHidden($('share-outside-box'), !isOwner);
    if (!isOwner) {
      toggleHidden($('share-input-drawer'), true);
      toggleHidden($('selected-budget-actions-menu'), true);
    }
    if (!b) return;

    const p = period(b, state.offset);
    if ($('period-label')) $('period-label').textContent = p.label;
    if ($('previous-period')) $('previous-period').disabled = state.offset === 0;

    const spent = records
      .filter(t => t.budget_id === b.id && (isSharedBudgetTx(t) || t.user_id === state.user.id))
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const limit = Number(b.amount_limit);
    if ($('budget-balance')) $('budget-balance').textContent = `${money(spent)} / ${money(limit)}`;
    if ($('budget-remaining')) $('budget-remaining').textContent = `${money(limit - spent)} igjen i perioden`;
    renderMemberSpending(b, records);
  }

  async function loadMembers(b) {
    if (!b) return;
    const { data, error } = await db.from('budget_members').select('display_name').eq('budget_id', b.id);
    if (state.selected !== b.id) return;
    if (!error && Array.isArray(data)) state.memberNames = data.map(m => m.display_name).filter(Boolean);
    if ($('member-list')) {
      $('member-list').textContent = error
        ? `Kunne ikke hente medlemmer: ${error.message}`
        : `Delt med: ${state.memberNames.length ? state.memberNames.join(', ') : 'ingen ennå'}`;
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
      const b = getBudget(t.budget_id);
      const isShared = isSharedBudgetTx(t);
      const isOwnTx = t.user_id === state.user?.id;
      const halfShare = Number(t.amount) / 2;
      const settled = Boolean(t.is_vippset);

      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = t.store_name;

      const meta = document.createElement('small');
      meta.className = 'row-meta';
      meta.textContent = [
        formatMonthYearFromDate(t.purchase_date),
        t.category,
        isShared ? `Felles (din andel: ${money(halfShare)})` : 'Personlig',
        b && !selected ? b.name : null,
        isShared ? `Lagt ut av ${t.actor_name || 'deltaker'}` : null,
        t.description
      ].filter(Boolean).join(' · ');

      info.append(title, meta);

      const right = document.createElement('div');
      right.className = 'row-right';

      // Den som ikke har lagt ut for et felles utlegg kan huke av på "Vippset?"
      if (isShared && !isOwnTx) {
        const label = document.createElement('label');
        label.className = 'vipps-toggle';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = settled;
        cb.addEventListener('change', async () => {
          cb.disabled = true;
          const ok = await toggleTransactionVippset(t.id, cb.checked);
          if (!ok) {
            cb.checked = !cb.checked;
            cb.disabled = false;
          }
        });

        const txt = document.createElement('span');
        txt.textContent = 'Vippset?';

        label.append(cb, txt);
        right.append(label);
      } else if (isShared && isOwnTx && settled) {
        const badge = document.createElement('span');
        badge.className = 'vipps-settled-badge';
        badge.textContent = 'Vippset ✓';
        right.append(badge);
      }

      const amount = document.createElement('strong');
      amount.className = 'amount';
      amount.textContent = money(Number(t.amount));
      right.append(amount);

      li.append(info, right);
      list.append(li);
    }
  }

function otherMemberName(tx) {
    const meta = state.user?.user_metadata || {};
    const myFirst = (meta.first_name || '').trim().toLowerCase();
    const myFull = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim().toLowerCase();
    const myEmail = (state.user?.email || '').trim().toLowerCase();
    const isMe = lbl => {
      const k = (lbl || '').trim().toLowerCase();
      return k && (k === myFirst || k === myFull || k === myEmail);
    };

    const otherFromMembers = state.memberNames.find(n => n && !isMe(n));
    if (otherFromMembers) return otherFromMembers.trim();

    const actor = (tx?.actor_name || '').trim();
    if (actor && !isMe(actor)) return actor;

    return 'Den andre deltakeren';
  }

function displayDashboard(records, yearVal, monthVal) {
    const sumScope = scope => records.filter(t => t.payment_scope === scope).reduce((n, t) => n + Number(t.amount), 0);
    if ($('shared-total')) $('shared-total').textContent = money(sumScope('shared'));
    if ($('dashboard-cycle-label')) $('dashboard-cycle-label').textContent = `${monthLabel(monthVal)} ${yearVal}`;

    // Beregn 50/50-gjeld i felles budsjetter (utenom det som er markert som vippset)
    const owedToMeByPerson = new Map();
    const iOweByPerson = new Map();

    for (const t of records) {
      if (!isSharedBudgetTx(t)) continue;
      if (t.is_vippset) continue;

      const half = Number(t.amount) / 2;
      if (t.user_id === state.user?.id) {
        const debtor = otherMemberName(t);
        owedToMeByPerson.set(debtor, (owedToMeByPerson.get(debtor) || 0) + half);
      } else {
        const creditor = (t.actor_name || '').trim() || 'Deltaker';
        iOweByPerson.set(creditor, (iOweByPerson.get(creditor) || 0) + half);
      }
    }

    const totalOwedToMe = [...owedToMeByPerson.values()].reduce((s, v) => s + v, 0);
    const totalIOwe = [...iOweByPerson.values()].reduce((s, v) => s + v, 0);
    const firstDebtor = [...owedToMeByPerson.entries()].find(([, v]) => v > 0)?.[0];
    const firstCreditor = [...iOweByPerson.entries()].find(([, v]) => v > 0)?.[0];

    if ($('debt-box-label') && $('debt-box-value')) {
      if (totalOwedToMe > 0 && totalIOwe === 0) {
        $('debt-box-label').textContent = `${firstDebtor || 'Kjæresten'} skylder`;
        $('debt-box-value').textContent = money(totalOwedToMe);
      } else if (totalIOwe > 0 && totalOwedToMe === 0) {
        $('debt-box-label').textContent = `Du skylder ${firstCreditor || 'kjæresten'}`;
        $('debt-box-value').textContent = money(totalIOwe);
      } else if (totalOwedToMe > 0 || totalIOwe > 0) {
        const net = totalOwedToMe - totalIOwe;
        if (net >= 0) {
          $('debt-box-label').textContent = `${firstDebtor || 'Kjæresten'} skylder (netto)`;
          $('debt-box-value').textContent = money(net);
        } else {
          $('debt-box-label').textContent = `Du skylder ${firstCreditor || 'kjæresten'} (netto)`;
          $('debt-box-value').textContent = money(Math.abs(net));
        }
      } else {
        $('debt-box-label').textContent = 'Gjeld / oppgjør';
        $('debt-box-value').textContent = money(0);
      }
    }

    const debtList = $('debt-summary-list');
    if (debtList) {
      debtList.replaceChildren();
      const rows = [];

      for (const [debtor, sum] of owedToMeByPerson.entries()) {
        if (sum > 0) {
          rows.push({
            text: `${debtor} skylder:`,
            amount: money(sum)
          });
        }
      }

      for (const [creditor, sum] of iOweByPerson.entries()) {
        if (sum > 0) {
          rows.push({
            text: `Du skylder ${creditor}:`,
            amount: money(sum)
          });
        }
      }

      if (!rows.length) {
        const li = document.createElement('li');
        li.textContent = 'Ingen utestående gjeld i denne perioden.';
        debtList.append(li);
      } else {
        for (const r of rows) {
          const li = document.createElement('li');
          li.innerHTML = `<span>${r.text}</span><strong class="amount">${r.amount}</strong>`;
          debtList.append(li);
        }
      }
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
      li.innerHTML = `<span>${name}</span><strong class="amount">${money(value)}</strong>`;
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
    const fields = 'id,user_id,budget_id,store_name,amount,category,payment_scope,actor_name,description,purchase_date,created_at,is_vippset';
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
        if ($('member-list')) $('member-list').textContent = `Delt med: ${state.memberNames.length ? state.memberNames.join(', ') : 'ingen ennå'}`;
      }

      displayDashboard(cycleRows, yearVal, monthVal);
      displayDetail(b, periodRows);
      displayTransactions(b ? periodRows : cycleRows, Boolean(b));
    } catch (err) {
      if (revision === state.revision) status(`Kunne ikke hente betalinger: ${err.message}`);
    }
  }

  function initialize() {
    populateDateSelects();
    apply25CycleToBudgetForm();
    if ($('trans-date')) $('trans-date').value = today();
    if ($('trans-category')) categories.forEach(c => $('trans-category').add(new Option(c, c)));

    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', e => { e.preventDefault(); window.switchView(item.dataset.view); });
    });

    $('dashboard-register-btn')?.addEventListener('click', () => goToRegister(state.selected));
    $('budgets-register-btn')?.addEventListener('click', () => goToRegister(state.selected));
    $('history-register-btn')?.addEventListener('click', () => goToRegister(state.selected));

    ['open-profile-sidebar', 'open-profile-mobile', 'open-profile-header'].forEach(id => $(id)?.addEventListener('click', openProfileView));

    $('profile-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      if (!state.user) return;
      clearStatus();
      const first_name = $('profile-firstname').value.trim();
      const last_name = $('profile-lastname').value.trim();
      const username = $('profile-username').value.trim();

      const { data: authData, error: authErr } = await db.auth.updateUser({ data: { first_name, last_name, username } });
      if (authErr) return status(`Kunne ikke oppdatere profil: ${authErr.message}`);
      if (authData?.user) state.user = authData.user;

      const { error: profErr } = await db.from('profiles').upsert({
        id: state.user.id,
        first_name: first_name || null,
        last_name: last_name || null,
        username: username || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

      if (profErr) return status(`Profil oppdatert i auth, men feil i profiles: ${profErr.message}`);
      syncUserDisplay();
      status('Profilen din er oppdatert.', 'success');
      await refresh();
    });

    $('hamburger-btn')?.addEventListener('click', () => { toggleHidden($('mobile-drawer'), false); toggleHidden($('mobile-drawer-backdrop'), false); });
    $('mobile-drawer-close')?.addEventListener('click', () => { toggleHidden($('mobile-drawer'), true); toggleHidden($('mobile-drawer-backdrop'), true); });
    $('mobile-drawer-backdrop')?.addEventListener('click', () => { toggleHidden($('mobile-drawer'), true); toggleHidden($('mobile-drawer-backdrop'), true); });

    $('sidebar-toggle-btn')?.addEventListener('click', () => {
      const mini = !$('sidebar')?.classList.contains('minimized');
      $('sidebar')?.classList.toggle('minimized', mini);
      document.body.classList.toggle('sidebar-minimized', mini);
      if (mini) setBudgetDropdownOpen(false, 'sidebar');
    });

    $('sidebar-budget-dropdown-btn')?.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      if ($('sidebar')?.classList.contains('minimized')) {
        $('sidebar').classList.remove('minimized');
        document.body.classList.remove('sidebar-minimized');
        setBudgetDropdownOpen(true, 'sidebar');
        return;
      }
      setBudgetDropdownOpen($('sidebar-budget-dropdown-btn').getAttribute('aria-expanded') !== 'true', 'sidebar');
    });

    $('mobile-budget-dropdown-btn')?.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      setBudgetDropdownOpen($('mobile-budget-dropdown-btn').getAttribute('aria-expanded') !== 'true', 'mobile');
    });

    $('selected-budget-actions-toggle')?.addEventListener('click', e => {
      e.stopPropagation();
      const willOpen = $('selected-budget-actions-menu')?.classList.contains('hidden');
      toggleHidden($('selected-budget-actions-menu'), !willOpen);
      $('selected-budget-actions-toggle').setAttribute('aria-expanded', String(willOpen));
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.budget-actions-under').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.arrow-toggle-plain').forEach(el => el.setAttribute('aria-expanded', 'false'));
    });

    $('toggle-new-budget-btn')?.addEventListener('click', () => {
      const willOpen = $('new-budget-drawer')?.classList.contains('hidden');
      if (willOpen) { resetBudgetForm(false); toggleHidden($('new-budget-drawer'), false); $('budget-name')?.focus(); }
      else resetBudgetForm(true);
    });

    $('close-budget-drawer-btn')?.addEventListener('click', () => { resetBudgetForm(true); clearStatus(); });
    $('toggle-share-input-btn')?.addEventListener('click', () => {
      const willOpen = $('share-input-drawer')?.classList.contains('hidden');
      toggleHidden($('share-input-drawer'), !willOpen);
      if (willOpen) $('share-identifier')?.focus();
    });

    $('edit-selected-budget-btn')?.addEventListener('click', () => state.selected && startEditingBudget(state.selected));
    $('delete-selected-budget-btn')?.addEventListener('click', () => state.selected && deleteBudgetById(state.selected));

    $('tab-login')?.addEventListener('click', () => {
      toggleHidden($('login-form'), false); toggleHidden($('signup-form'), true);
      $('tab-login')?.classList.add('active'); $('tab-signup')?.classList.remove('active');
      clearStatus('auth-error');
    });

    $('tab-signup')?.addEventListener('click', () => {
      toggleHidden($('signup-form'), false); toggleHidden($('login-form'), true);
      $('tab-signup')?.classList.add('active'); $('tab-login')?.classList.remove('active');
      clearStatus('auth-error');
    });

    if (!db) return status('Kunne ikke laste Supabase.', 'error', 'auth-error');

    $('signup-form')?.addEventListener('submit', async e => {
      e.preventDefault(); clearStatus('auth-error');
      const { data, error } = await db.auth.signUp({
        email: $('signup-email').value.trim(),
        password: $('signup-password').value,
        options: { data: { first_name: $('signup-firstname').value.trim(), last_name: $('signup-lastname').value.trim(), username: $('signup-username').value.trim() } }
      });
      if (error) return status(`Registrering feilet: ${error.message}`, 'error', 'auth-error');
      $('signup-form').reset();
      if (!data.session) { $('tab-login')?.click(); status('Konto opprettet. Bekreft e-posten før du logger inn.', 'success', 'auth-error'); }
    });

    $('login-form')?.addEventListener('submit', async e => {
      e.preventDefault(); clearStatus('auth-error');
      const { error } = await db.auth.signInWithPassword({ email: $('login-email').value.trim(), password: $('login-password').value });
      if (error) status(`Innlogging feilet: ${error.message === 'Invalid login credentials' ? 'Feil e-post eller passord.' : error.message}`, 'error', 'auth-error');
    });

    const handleLogout = async () => { const { error } = await db.auth.signOut(); if (error) status(error.message); };
    $('logout-btn-sidebar')?.addEventListener('click', handleLogout);
    $('logout-btn-mobile')?.addEventListener('click', handleLogout);

    $('set-25-cycle-btn')?.addEventListener('click', () => { apply25CycleToBudgetForm(); status('Datoene er satt til 25. – 25.', 'success'); });

    $('budget-form')?.addEventListener('submit', async e => {
      e.preventDefault(); clearStatus();
      const start = $('budget-start').value, end = $('budget-end').value;
      if (!start || !end || end <= start) return status('Sluttdato må være etter startdato.');

      const payload = {
        title: $('budget-name').value.trim(),
        total_amount: Number($('budget-limit').value),
        start_date: start,
        end_date: end,
        kind: $('budget-type').value
      };

      if (state.editingBudgetId) {
        const { error } = await db.from('budgets').update(payload).eq('id', state.editingBudgetId).eq('created_by', state.user.id);
        if (error) return status(`Kunne ikke oppdatere budsjett: ${error.message}`);
        resetBudgetForm(true); await loadBudgets();
        status('Budsjettet er oppdatert.', 'success');
        return window.switchView('budgets');
      }

      const { data, error } = await db.from('budgets').insert({ ...payload, created_by: state.user.id }).select('id').single();
      if (error) return status(`Kunne ikke opprette budsjett: ${error.message}`);
      resetBudgetForm(true); await loadBudgets(); selectBudget(data.id);
      status('Budsjettet er opprettet.', 'success');
      window.switchView('budgets');
    });

    $('selected-budget')?.addEventListener('change', e => selectBudget(e.target.value));
    $('trans-budget')?.addEventListener('change', () => { if (!$('trans-budget').value && $('trans-scope')) $('trans-scope').value = 'personal'; });
    $('previous-period')?.addEventListener('click', () => { state.offset = Math.max(0, state.offset - 1); refresh(); });
    $('next-period')?.addEventListener('click', () => { state.offset++; refresh(); });
    $('dashboard-year')?.addEventListener('change', refresh);
    $('dashboard-month')?.addEventListener('change', refresh);

    $('share-form')?.addEventListener('submit', async e => {
      e.preventDefault(); clearStatus();
      const b = getBudget(state.selected);
      if (!b || b.owner_id !== state.user?.id) return;
      const ids = $('share-identifier').value.split(',').map(s => s.trim()).filter(Boolean);
      const added = [];
      for (const identifier of ids) {
        const { data, error } = await db.rpc('add_budget_member', { p_budget: b.id, p_identifier: identifier });
        if (error) return status(`Kunne ikke dele med ${identifier}: ${error.message}`);
        added.push(data);
      }
      $('share-form').reset();
      toggleHidden($('share-input-drawer'), true);
      status(`Lagt til: ${added.join(', ')}`, 'success');
      loadMembers(b);
    });

    $('transaction-form')?.addEventListener('submit', async e => {
      e.preventDefault(); clearStatus();
      const b = getBudget($('trans-budget').value);
      if (b && $('trans-date').value < b.first_start) return status('Betalingsdato er før budsjettets første periode.');
      const { error } = await db.from('transactions').insert({
        user_id: state.user.id,
        budget_id: b?.id || null,
        store_name: $('trans-store').value.trim(),
        amount: Number($('trans-amount').value),
        description: $('trans-desc').value.trim() || null,
        purchase_date: $('trans-date').value,
        category: $('trans-category').value,
        payment_scope: $('trans-scope').value,
        is_vippset: false
      });
      if (error) return status(`Kunne ikke lagre betaling: ${error.message}`);
      $('transaction-form').reset();
      $('trans-date').value = today();
      $('trans-budget').value = b?.id || '';
      status('Betalingen er lagret.', 'success');
      await refresh();
      window.switchView('history');
    });

    db.auth.onAuthStateChange((_ev, session) => {
      const id = session?.user?.id;
      if (!id) { if (state.user) showAuth(); return; }
      if (id !== state.user?.id) setTimeout(() => showApp(session.user), 0);
      else state.user = session.user;
    });

    db.auth.getSession().then(({ data, error }) => {
      if (error) return status(`Kunne ikke hente økt: ${error.message}`, 'error', 'auth-error');
      if (data.session?.user && !state.user) showApp(data.session.user);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();