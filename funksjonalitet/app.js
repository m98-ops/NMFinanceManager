window.switchView = viewName => {
  document.querySelectorAll('.nav-item').forEach(item => {
    const target = item.dataset.view || item.getAttribute('onclick')?.match(/switchView\('([^']+)'\)/)?.[1];
    item.classList.toggle('active', target === viewName);
  });
  document.querySelectorAll('.view-content').forEach(c => {
    const match = c.id === `view-${viewName}`;
    c.classList.toggle('active', match);
    c.classList.toggle('hidden', !match);
  });
  if (window.innerWidth < 768) window.scrollTo({ top: 0, behavior: 'instant' });
};

(() => {
  'use strict';

  const S = window.NMStore;
  if (!S) return;
  const { db, CATEGORIES, MONTHS, $, hideEl, money, nextDate, today, monthName, fmtDDMM, cycleRange, activeCycle, state, clearStatus, status } = S;

  const anchor25Idx = b => {
    const d = S.parseDate(b.first_start);
    return d.getFullYear() * 12 + d.getMonth() + (d.getDate() > 25 ? 1 : 0);
  };

  const period = (b, offset) => {
    const total = anchor25Idx(b) + offset;
    const endYear = Math.floor(total / 12), endMonthIdx = total % 12;
    return {
      start: S.fmtDate(new Date(endYear, endMonthIdx - 1, 25)),
      end: S.fmtDate(new Date(endYear, endMonthIdx, 25)),
      label: `${monthName(String(endMonthIdx + 1).padStart(2, '0'))} ${endYear}`
    };
  };

  const thisPeriod = b => {
    const act = activeCycle();
    return Math.max(0, (act.year * 12 + (Number(act.month) - 1)) - anchor25Idx(b));
  };

  const getBudget = id => state.budgets.find(b => b.id === id);
  const isSharedTx = t => t.payment_scope === 'shared';
  const isDebtTx = t => !isSharedTx(t) && getBudget(t.budget_id)?.kind === 'shared';
  const isIOweTx = t => isDebtTx(t) && t.user_id !== state.user?.id;

  const goToRegister = budgetId => {
    if (budgetId && $('trans-budget')) $('trans-budget').value = budgetId;
    window.switchView('register');
  };

  function syncUserDisplay() {
    if (!state.user) return;
    const meta = state.user.user_metadata || {};
    if ($('user-name-sidebar')) $('user-name-sidebar').textContent = meta.first_name || state.user.email;
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

  function apply25Cycle() {
    const { range } = activeCycle();
    if ($('budget-start')) $('budget-start').value = range.start;
    if ($('budget-end')) $('budget-end').value = range.end;
  }

  function resetBudgetForm(closeDrawer = false) {
    state.editingBudgetId = null;
    $('budget-form')?.reset();
    apply25Cycle();
    if ($('budget-form-title')) $('budget-form-title').textContent = 'Opprett nytt budsjett';
    if ($('budget-submit-btn')) $('budget-submit-btn').textContent = 'Opprett budsjett';
    if (closeDrawer) hideEl($('new-budget-drawer'), true);
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
    hideEl($('new-budget-drawer'), false);
    window.switchView('budgets');
    $('budget-name')?.focus();
  }

  async function deleteBudgetById(budgetId) {
    const b = getBudget(budgetId);
    if (!b || b.owner_id !== state.user?.id || !window.confirm(`Er du sikker på at du vil slette budsjettet "${b.name}"?`)) return;
    clearStatus();
    const { error } = await db.from('budgets').delete().eq('id', b.id).eq('created_by', state.user.id);
    if (error) return status(`Kunne ikke slette budsjett: ${error.message}`);
    if (state.editingBudgetId === b.id) resetBudgetForm(true);
    if (state.selected === b.id) { state.selected = ''; state.offset = 0; }
    await loadBudgets();
    status(`Budsjettet "${b.name}" er slettet.`, 'success');
  }

  const setBudgetDropdownOpen = open => {
    $('sidebar-budget-dropdown-btn')?.setAttribute('aria-expanded', String(open));
    hideEl($('sidebar-budget-dropdown'), !open);
  };

  function renderBudgetDropdowns() {
    const list = $('sidebar-budget-dropdown');
    if (!list) return;
    list.replaceChildren();
    if (!state.budgets.length) {
      const li = document.createElement('li');
      li.className = 'dropdown-empty';
      li.textContent = 'Ingen budsjetter';
      return list.append(li);
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
    renderBudgetDropdowns();
  }

  function showAuth() {
    state.revision++;
    Object.assign(state, { user: null, budgets: [], selected: '', memberNames: [], editingBudgetId: null });
    document.body.classList.remove('is-authenticated');
    setBudgetDropdownOpen(false);
    resetBudgetForm(true);
    hideEl($('auth-section'), false);
    ['app-section', 'mobile-header', 'mobile-bottom-nav'].forEach(id => hideEl($(id), true));
    ['transactions-list', 'budget-list', 'member-spending-grid', 'debt-items-list'].forEach(id => $(id)?.replaceChildren());
    renderBudgetDropdowns();
    window.switchView('dashboard');
  }

  async function showApp(user) {
    state.user = user;
    document.body.classList.add('is-authenticated');
    hideEl($('auth-section'), true);
    ['app-section', 'mobile-header', 'mobile-bottom-nav'].forEach(id => hideEl($(id), false));
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
    const rev = ++state.revision;
    try {
      const { data, error } = await db.from('budgets').select('id,created_by,title,total_amount,start_date,end_date,kind').order('created_at', { ascending: false });
      if (error) throw error;
      if (rev !== state.revision) return;
      state.budgets = data.map(r => ({ ...r, owner_id: r.created_by, name: r.title, amount_limit: r.total_amount, first_start: r.start_date, first_end: r.end_date }));
      if (!getBudget(state.selected)) { state.selected = ''; state.offset = 0; }
      setOptions();
      renderBudgetList();
      await refresh();
    } catch (err) {
      if (rev === state.revision) status(`Kunne ikke hente budsjetter: ${err.message}`);
    }
  }

  function renderBudgetList() {
    const list = $('budget-list');
    if (!list) return;
    list.replaceChildren();
    if (!state.budgets.length) {
      const li = document.createElement('li');
      li.textContent = 'Ingen budsjetter ennå. Trykk «Nytt budsjett» over for å opprette ett.';
      return list.append(li);
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
          const open = actionsMenu.classList.contains('hidden');
          document.querySelectorAll('.budget-actions-under').forEach(el => el.classList.add('hidden'));
          document.querySelectorAll('.arrow-toggle-plain').forEach(el => el.setAttribute('aria-expanded', 'false'));
          hideEl(actionsMenu, !open);
          toggleBtn.setAttribute('aria-expanded', String(open));
        });
        nameRow.append(toggleBtn);
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'budget-button';
      btn.textContent = b.name;
      btn.addEventListener('click', () => { selectBudget(b.id); window.switchView('history'); });
      nameRow.append(btn);

      const meta = document.createElement('small');
      meta.className = `row-meta${isOwner ? ' indented' : ''}`;
      meta.textContent = `${b.kind === 'shared' ? 'Felles' : 'Personlig'} · ${isOwner ? 'Eier' : 'Medlem'} · ${period(b, thisPeriod(b)).label}`;

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
    hideEl($('share-input-drawer'), true);
    hideEl($('selected-budget-actions-menu'), true);
    $('selected-budget-actions-toggle')?.setAttribute('aria-expanded', 'false');
    renderBudgetDropdowns();
    refresh();
  }

  function renderMemberSpending(b, records) {
    const grid = $('member-spending-grid');
    if (!grid || !b) return;
    grid.replaceChildren();

    const meta = state.user.user_metadata || {};
    const me = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim() || meta.first_name || state.user.email || 'Meg';
    const firstClean = (meta.first_name || '').trim().toLowerCase();
    const canon = lbl => { const c = (lbl || '').trim(); return c && firstClean && c.toLowerCase() === firstClean ? me : c; };

    const totals = new Map();
    const add = lbl => { const k = canon(lbl); if (k && !totals.has(k)) totals.set(k, 0); };
    if (b.owner_id === state.user.id) add(me);
    state.memberNames.forEach(add);
    records.filter(t => t.budget_id === b.id).forEach(t => {
      const k = canon(t.actor_name || (t.user_id === state.user.id ? me : 'Medlem'));
      if (k) totals.set(k, (totals.get(k) || 0) + Number(t.amount));
    });

    if (!totals.size) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Ingen medlemmer eller betalinger registrert i denne perioden.';
      return grid.append(p);
    }

    [...totals.entries()].sort((a, b) => b[1] - a[1]).forEach(([lbl, sum], i) => {
      const card = document.createElement('div');
      card.className = `member-stat-card${i === 0 ? ' highlight' : ''}`;
      card.innerHTML = `<span class="stat-label">${lbl}</span><span class="stat-value">${money(sum)}</span>`;
      grid.append(card);
    });
  }

  function displayDetail(b, records) {
    if (!$('budget-detail')) return;
    hideEl($('budget-detail'), !b);
    const isOwner = Boolean(b && b.owner_id === state.user.id);
    hideEl($('selected-budget-actions-toggle'), !isOwner);
    hideEl($('share-outside-box'), !isOwner);
    if (!isOwner) { hideEl($('share-input-drawer'), true); hideEl($('selected-budget-actions-menu'), true); }
    if (!b) return;

    const p = period(b, state.offset);
    if ($('period-label')) $('period-label').textContent = p.label;
    if ($('previous-period')) $('previous-period').disabled = state.offset === 0;

    const spent = records.filter(t => t.budget_id === b.id && (b.kind === 'shared' || t.user_id === state.user.id)).reduce((s, t) => s + Number(t.amount), 0);
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
    if ($('member-list')) $('member-list').textContent = error ? `Kunne ikke hente medlemmer: ${error.message}` : `Delt med: ${state.memberNames.length ? state.memberNames.join(', ') : 'ingen ennå'}`;
    await refresh();
  }

  function createVippsCheckbox(t) {
    const settled = Boolean(t.is_vippset);
    const label = document.createElement('label');
    label.className = 'vipps-toggle';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = settled;
    const txt = document.createElement('span');
    txt.textContent = settled ? 'Vippset' : 'Vippset?';

    cb.addEventListener('change', async () => {
      cb.disabled = true;
      txt.textContent = cb.checked ? 'Vippset' : 'Vippset?';
      const { error } = await db.from('transactions').update({ is_vippset: cb.checked }).eq('id', t.id);
      if (error) {
        cb.checked = !cb.checked;
        txt.textContent = cb.checked ? 'Vippset' : 'Vippset?';
        cb.disabled = false;
        return status(`Kunne ikke oppdatere Vipps-status: ${error.message}`);
      }
      status(cb.checked ? 'Markert som vippset.' : 'Vipps-markering fjernet.', 'success');
      await refresh();
    });

    label.append(cb, txt);
    return label;
  }

  function renderCleanRow(t, displayAmount, showVippsControls) {
    const li = document.createElement('li');
    const noteText = (t.description || '').trim();

    const top = document.createElement('div');
    top.className = 'tx-top-line';
    const title = document.createElement('strong');
    title.className = 'tx-main-title';
    title.textContent = `${t.store_name} - ${fmtDDMM(t.purchase_date)}`;
    const amt = document.createElement('strong');
    amt.className = 'amount';
    amt.textContent = money(displayAmount);
    top.append(title, amt);
    li.append(top);

    const right = document.createElement('div');
    right.className = 'row-right';
    if (showVippsControls) {
      right.append(createVippsCheckbox(t));
    }

    if (noteText || right.childNodes.length) {
      const bottom = document.createElement('div');
      bottom.className = 'tx-bottom-line';
      const note = document.createElement('span');
      note.className = 'tx-note-text';
      note.textContent = noteText;
      bottom.append(note, right);
      li.append(bottom);
    }
    return li;
  }

  function displayTransactions(records) {
    const list = $('transactions-list');
    if (!list) return;
    list.replaceChildren();
    if (!records.length) {
      const li = document.createElement('li');
      li.textContent = 'Ingen betalinger i denne perioden.';
      return list.append(li);
    }
    records.forEach(t => list.append(renderCleanRow(t, Number(t.amount), false)));
  }

  function displayDebtView(records, yVal, mVal) {
    const list = $('debt-items-list');
    if (!list) return;
    list.replaceChildren();
    if ($('debt-view-subtitle')) $('debt-view-subtitle').textContent = `Periode: ${monthName(mVal)} ${yVal}`;

    const items = records.filter(isIOweTx);
    if (!items.length) {
      const li = document.createElement('li');
      li.textContent = 'Du har ingen utlegg du skylder i denne perioden.';
      return list.append(li);
    }
    items.forEach(t => list.append(renderCleanRow(t, Number(t.amount) / 2, true)));
  }

  function displayDashboard(records, yVal, mVal) {
    const sharedTotal = records.filter(isSharedTx).reduce((n, t) => n + Number(t.amount), 0);
    if ($('shared-total')) $('shared-total').textContent = money(sharedTotal);
    if ($('dashboard-cycle-label')) $('dashboard-cycle-label').textContent = `${monthName(mVal)} ${yVal}`;

    const iOweTotal = records
      .filter(t => isIOweTx(t) && !t.is_vippset)
      .reduce((s, t) => s + Number(t.amount) / 2, 0);

    if ($('debt-box-label')) $('debt-box-label').textContent = 'Skylder';
    if ($('debt-box-value')) $('debt-box-value').textContent = money(iOweTotal);

    const sums = new Map();
    records.forEach(t => sums.set(t.category, (sums.get(t.category) || 0) + Number(t.amount)));
    const list = $('category-totals');
    if (!list) return;
    list.replaceChildren();
    if (!sums.size) {
      const li = document.createElement('li');
      li.textContent = 'Ingen betalinger i denne perioden.';
      return list.append(li);
    }
    [...sums].sort((a, b) => b[1] - a[1]).forEach(([name, val]) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${name}</span><strong class="amount">${money(val)}</strong>`;
      list.append(li);
    });
  }

  async function refresh() {
    if (!state.user) return;
    const rev = ++state.revision;
    const b = getBudget(state.selected);
    const act = activeCycle();
    const yVal = $('dashboard-year')?.value || String(act.year);
    const mVal = $('dashboard-month')?.value || act.month;
    const cyc = cycleRange(yVal, mVal);
    const chosen = b && period(b, state.offset);
    const fields = 'id,user_id,budget_id,store_name,amount,category,payment_scope,actor_name,description,purchase_date,created_at,is_vippset';
    const fetchPeriod = (start, end, budgetId) => fetchAll('transactions', fields, q => {
      q = q.gte('purchase_date', start).lt('purchase_date', end).order('purchase_date', { ascending: false }).order('created_at', { ascending: false });
      return budgetId ? q.eq('budget_id', budgetId) : q;
    });

    try {
      const [cycleRows, periodRows, membersRes] = await Promise.all([
        fetchPeriod(cyc.start, nextDate(cyc.end)),
        chosen ? fetchPeriod(chosen.start, nextDate(chosen.end), b.id) : Promise.resolve([]),
        b ? db.from('budget_members').select('display_name').eq('budget_id', b.id) : Promise.resolve({ data: [], error: null })
      ]);
      if (rev !== state.revision) return;

      if (b && !membersRes.error && Array.isArray(membersRes.data)) {
        state.memberNames = membersRes.data.map(m => m.display_name).filter(Boolean);
        if ($('member-list')) $('member-list').textContent = `Delt med: ${state.memberNames.length ? state.memberNames.join(', ') : 'ingen ennå'}`;
      }

      displayDashboard(cycleRows, yVal, mVal);
      displayDebtView(cycleRows, yVal, mVal);
      displayDetail(b, periodRows);
      displayTransactions(b ? periodRows : cycleRows);
    } catch (err) {
      if (rev === state.revision) status(`Kunne ikke hente betalinger: ${err.message}`);
    }
  }

  function initialize() {
    const act = activeCycle();
    if ($('dashboard-year')) {
      for (let y = act.year - 3; y <= act.year + 2; y++) $('dashboard-year').add(new Option(String(y), String(y)));
      $('dashboard-year').value = String(act.year);
    }
    if ($('dashboard-month')) {
      MONTHS.forEach(([v, l]) => $('dashboard-month').add(new Option(l, v)));
      $('dashboard-month').value = act.month;
    }
    apply25Cycle();
    if ($('trans-date')) $('trans-date').value = today();
    if ($('trans-category')) CATEGORIES.forEach(c => $('trans-category').add(new Option(c, c)));

    $('dashboard-refresh-btn')?.addEventListener('click', () => window.location.reload());

    document.querySelectorAll('.nav-item[data-view]').forEach(item => item.addEventListener('click', e => {
      e.preventDefault();
      const v = item.dataset.view;
      if (v === 'profile') openProfileView();
      else if (v === 'register') goToRegister(state.selected);
      else window.switchView(v);
    }));

    $('debt-box-card')?.addEventListener('click', () => window.switchView('debt'));
    $('debt-box-card')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.switchView('debt'); }
    });

    ['dashboard-register-btn', 'budgets-register-btn', 'history-register-btn'].forEach(id => $(id)?.addEventListener('click', () => goToRegister(state.selected)));
    $('open-profile-sidebar')?.addEventListener('click', openProfileView);

    $('profile-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      if (!state.user) return;
      clearStatus();
      const first_name = $('profile-firstname').value.trim(), last_name = $('profile-lastname').value.trim(), username = $('profile-username').value.trim();
      const { data: authData, error: authErr } = await db.auth.updateUser({ data: { first_name, last_name, username } });
      if (authErr) return status(`Kunne ikke oppdatere profil: ${authErr.message}`);
      if (authData?.user) state.user = authData.user;
      const { error: profErr } = await db.from('profiles').upsert({ id: state.user.id, first_name: first_name || null, last_name: last_name || null, username: username || null, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (profErr) return status(`Profil oppdatert i auth, men feil i profiles: ${profErr.message}`);
      syncUserDisplay();
      status('Profilen din er oppdatert.', 'success');
      await refresh();
    });

    $('sidebar-toggle-btn')?.addEventListener('click', () => {
      const mini = !$('sidebar')?.classList.contains('minimized');
      $('sidebar')?.classList.toggle('minimized', mini);
      document.body.classList.toggle('sidebar-minimized', mini);
      if (mini) setBudgetDropdownOpen(false);
    });

    $('sidebar-budget-dropdown-btn')?.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      if ($('sidebar')?.classList.contains('minimized')) {
        $('sidebar').classList.remove('minimized');
        document.body.classList.remove('sidebar-minimized');
        return setBudgetDropdownOpen(true);
      }
      setBudgetDropdownOpen($('sidebar-budget-dropdown-btn').getAttribute('aria-expanded') !== 'true');
    });

    $('selected-budget-actions-toggle')?.addEventListener('click', e => {
      e.stopPropagation();
      const open = $('selected-budget-actions-menu')?.classList.contains('hidden');
      hideEl($('selected-budget-actions-menu'), !open);
      $('selected-budget-actions-toggle').setAttribute('aria-expanded', String(open));
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.budget-actions-under').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.arrow-toggle-plain').forEach(el => el.setAttribute('aria-expanded', 'false'));
    });

    $('toggle-new-budget-btn')?.addEventListener('click', () => {
      const open = $('new-budget-drawer')?.classList.contains('hidden');
      if (open) { resetBudgetForm(false); hideEl($('new-budget-drawer'), false); $('budget-name')?.focus(); }
      else resetBudgetForm(true);
    });
    $('close-budget-drawer-btn')?.addEventListener('click', () => { resetBudgetForm(true); clearStatus(); });
    $('toggle-share-input-btn')?.addEventListener('click', () => {
      const open = $('share-input-drawer')?.classList.contains('hidden');
      hideEl($('share-input-drawer'), !open);
      if (open) $('share-identifier')?.focus();
    });
    $('edit-selected-budget-btn')?.addEventListener('click', () => state.selected && startEditingBudget(state.selected));
    $('delete-selected-budget-btn')?.addEventListener('click', () => state.selected && deleteBudgetById(state.selected));

    const setAuthTab = isLogin => {
      hideEl($('login-form'), !isLogin); hideEl($('signup-form'), isLogin);
      $('tab-login')?.classList.toggle('active', isLogin); $('tab-signup')?.classList.toggle('active', !isLogin);
      clearStatus('auth-error');
    };
    $('tab-login')?.addEventListener('click', () => setAuthTab(true));
    $('tab-signup')?.addEventListener('click', () => setAuthTab(false));

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
      if (!data.session) { setAuthTab(true); status('Konto opprettet. Bekreft e-posten før du logger inn.', 'success', 'auth-error'); }
    });

    $('login-form')?.addEventListener('submit', async e => {
      e.preventDefault(); clearStatus('auth-error');
      const { error } = await db.auth.signInWithPassword({ email: $('login-email').value.trim(), password: $('login-password').value });
      if (error) status(`Innlogging feilet: ${error.message === 'Invalid login credentials' ? 'Feil e-post eller passord.' : error.message}`, 'error', 'auth-error');
    });

    const handleLogout = async () => { const { error } = await db.auth.signOut(); if (error) status(error.message); };
    ['logout-btn-sidebar', 'logout-btn-mobile-top', 'logout-btn-profile'].forEach(id => $(id)?.addEventListener('click', handleLogout));

    $('set-25-cycle-btn')?.addEventListener('click', () => { apply25Cycle(); status('Datoene er satt til 25. – 25.', 'success'); });

    $('budget-form')?.addEventListener('submit', async e => {
      e.preventDefault(); clearStatus();
      const start = $('budget-start').value, end = $('budget-end').value;
      if (!start || !end || end <= start) return status('Sluttdato må være etter startdato.');
      const payload = { title: $('budget-name').value.trim(), total_amount: Number($('budget-limit').value), start_date: start, end_date: end, kind: $('budget-type').value };

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
      hideEl($('share-input-drawer'), true);
      status(`Lagt til: ${added.join(', ')}`, 'success');
      loadMembers(b);
    });

    $('transaction-form')?.addEventListener('submit', async e => {
      e.preventDefault(); clearStatus();
      const b = getBudget($('trans-budget').value);
      if (b && $('trans-date').value < b.first_start) return status('Betalingsdato er før budsjettets første periode.');
      const { error } = await db.from('transactions').insert({
        user_id: state.user.id, budget_id: b?.id || null, store_name: $('trans-store').value.trim(),
        amount: Number($('trans-amount').value), description: $('trans-desc').value.trim() || null,
        purchase_date: $('trans-date').value, category: $('trans-category').value,
        payment_scope: $('trans-shared-account')?.value === 'yes' ? 'shared' : 'personal', is_vippset: false
      });
      if (error) return status(`Kunne ikke lagre betaling: ${error.message}`);
      $('transaction-form').reset();
      $('trans-date').value = today();
      $('trans-budget').value = b?.id || '';
      if ($('trans-shared-account')) $('trans-shared-account').value = 'no';
      status('Betalingen er lagret.', 'success');
      await refresh();
      window.switchView('history');
    });

    db.auth.onAuthStateChange((_ev, session) => {
      const id = session?.user?.id;
      if (!id) return state.user ? showAuth() : undefined;
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