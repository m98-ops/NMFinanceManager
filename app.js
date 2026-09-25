const SUPABASE_URL = 'https://nbrqtupxrlrfhwodigou.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5icnF0dXB4cmxyZmh3b2RpZ291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDU4NzIsImV4cCI6MjEwNTU4MTg3Mn0.FicNmSAkaDP1q0I70SlmD7iD3LZ52lMhFtNufPgjzQ0';

(() => {
  'use strict';
  const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  const categories = ['Mat', 'Bolig', 'Transport', 'Regninger', 'Helse', 'Fritid', 'Shopping', 'Sparing', 'Annet'];
  const money = value => `${new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} kr`;
  const dateString = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const shiftMonth = (s, shift) => { const d = parseDate(s); const first = new Date(d.getFullYear(), d.getMonth() + shift, 1); const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(); return dateString(new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last))); };
  const nextDate = s => { const d = parseDate(s); d.setDate(d.getDate() + 1); return dateString(d); };
  const today = () => dateString(new Date());
  const monthlyRange = month => ({ start: `${month}-01`, end: shiftMonth(`${month}-01`, 1) });
  const period = (budget, offset) => ({ start: shiftMonth(budget.first_start, offset), end: shiftMonth(budget.first_end, offset) });
  const thisPeriod = budget => {
    const now = new Date(); const anchor = parseDate(budget.first_start);
    let offset = (now.getFullYear() - anchor.getFullYear()) * 12 + now.getMonth() - anchor.getMonth();
    if (offset < 0) return 0;
    if (period(budget, offset).start > today()) offset--;
    return Math.max(0, offset);
  };
  const state = { user: null, budgets: [], selected: '', offset: 0, revision: 0 };
  const getBudget = id => state.budgets.find(b => b.id === id);

  function status(text, type = 'error', target = 'app-message') {
    const el = $(target); if (!el) return;
    el.textContent = text; el.className = `message ${type}`;
  }
  function clearStatus(target = 'app-message') { $(target).textContent = ''; $(target).className = 'message hidden'; }
  function setOptions() {
    const old = $('trans-budget').value;
    for (const id of ['selected-budget', 'trans-budget']) {
      const el = $(id); el.replaceChildren(new Option(id === 'trans-budget' ? 'Uten budsjett' : 'Velg budsjett', ''));
      state.budgets.forEach(b => el.add(new Option(`${b.name} (${b.kind === 'shared' ? 'felles' : 'personlig'})`, b.id)));
    }
    $('selected-budget').value = state.selected;
    $('trans-budget').value = state.selected || old;
    if (!$('trans-budget').value) $('trans-scope').value = 'personal';
    updateScope();
  }
  function updateScope() {
    const b = getBudget($('trans-budget').value);
    const shared = b?.kind === 'shared';
    $('trans-scope').querySelector('[value="shared"]').disabled = !shared;
    if (!shared) $('trans-scope').value = 'personal';
  }
  function showAuth() {
    state.revision++; state.user = null; state.budgets = []; state.selected = '';
    $('auth-section').classList.remove('hidden'); $('app-section').classList.add('hidden'); $('user-info').classList.add('hidden');
    $('transactions-list').replaceChildren(); $('budget-list').replaceChildren();
  }
  async function showApp(user) {
    state.user = user;
    $('auth-section').classList.add('hidden'); $('app-section').classList.remove('hidden'); $('user-info').classList.remove('hidden');
    $('user-name').textContent = `Hei, ${user.user_metadata?.first_name || user.email}`;
    await loadBudgets();
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
      const { data, error } = await db.from('budgets').select('id,created_by,title,total_amount,start_date,end_date,kind').order('created_at', { ascending: false });
      if (error) throw error;
      if (revision !== state.revision) return;
      state.budgets = data.map(row => ({ ...row, owner_id: row.created_by, name: row.title, amount_limit: row.total_amount, first_start: row.start_date, first_end: row.end_date }));
      if (!getBudget(state.selected)) { state.selected = ''; state.offset = 0; }
      setOptions(); renderBudgetList();
      await refresh();
    } catch (err) { if (revision === state.revision) status(`Kunne ikke hente budsjetter: ${err.message}`); }
  }
  function renderBudgetList() {
    const list = $('budget-list'); list.replaceChildren();
    if (!state.budgets.length) { const li = document.createElement('li'); li.textContent = 'Ingen budsjetter ennå.'; list.append(li); }
    for (const b of state.budgets) {
      const li = document.createElement('li'); const content = document.createElement('div');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'budget-button'; button.textContent = b.name;
      button.addEventListener('click', () => selectBudget(b.id));
      const meta = document.createElement('small'); meta.className = 'row-meta'; meta.textContent = `${b.kind === 'shared' ? 'Felles' : 'Personlig'} · ${b.first_start} – ${b.first_end}, gjentas månedlig`;
      content.append(button, meta); const amount = document.createElement('strong'); amount.className = 'amount'; amount.textContent = money(Number(b.amount_limit));
      li.append(content, amount); list.append(li);
    }
  }
  function selectBudget(id) {
    state.selected = id; const b = getBudget(id); state.offset = b ? thisPeriod(b) : 0;
    $('selected-budget').value = id;
    if (id) $('trans-budget').value = id;
    updateScope(); refresh();
  }
  function displayDetail(b, records) {
    $('budget-detail').classList.toggle('hidden', !b);
    if (!b) return;
    const r = period(b, state.offset);
    $('period-label').textContent = `${r.start} – ${r.end}`;
    $('previous-period').disabled = state.offset === 0;
    const spent = records.filter(t => t.budget_id === b.id && (t.payment_scope === 'shared' || t.user_id === state.user.id))
      .reduce((sum, t) => sum + Number(t.amount), 0);
    $('budget-balance').textContent = `${money(spent)} av ${money(Number(b.amount_limit))} · ${money(Number(b.amount_limit) - spent)} igjen`;
    $('share-section').classList.toggle('hidden', b.kind !== 'shared');
    $('share-form').classList.toggle('hidden', b.owner_id !== state.user.id);
    if (b.kind === 'shared') loadMembers(b);
  }
  async function loadMembers(b) {
    const { data, error } = await db.from('budget_members').select('display_name').eq('budget_id', b.id).order('joined_at');
    if (state.selected !== b.id) return;
    $('member-list').textContent = error ? `Kunne ikke hente medlemmer: ${error.message}` :
      `Delt med: ${data.length ? data.map(m => m.display_name).join(', ') : 'ingen ennå'}`;
  }
  function displayTransactions(records, selected) {
    const list = $('transactions-list'); list.replaceChildren();
    if (!records.length) { const li = document.createElement('li'); li.textContent = 'Ingen betalinger i denne perioden.'; list.append(li); }
    for (const t of records) {
      const li = document.createElement('li'); const info = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = t.store_name;
      const meta = document.createElement('small'); meta.className = 'row-meta';
      const b = getBudget(t.budget_id);
      meta.textContent = [t.purchase_date, t.category, t.payment_scope === 'shared' ? 'Felles' : 'Personlig',
        b && !selected ? b.name : null, t.payment_scope === 'shared' ? `Registrert av ${t.actor_name}` : null, t.description].filter(Boolean).join(' · ');
      info.append(title, meta); const amount = document.createElement('strong'); amount.className = 'amount'; amount.textContent = money(Number(t.amount));
      li.append(info, amount); list.append(li);
    }
  }
  function displayDashboard(records) {
    const personal = records.filter(t => t.payment_scope === 'personal');
    const shared = records.filter(t => t.payment_scope === 'shared');
    $('personal-total').textContent = money(personal.reduce((n, t) => n + Number(t.amount), 0));
    $('shared-total').textContent = money(shared.reduce((n, t) => n + Number(t.amount), 0));
    const sums = new Map();
    for (const t of records) sums.set(t.category, (sums.get(t.category) || 0) + Number(t.amount));
    const list = $('category-totals'); list.replaceChildren();
    if (!sums.size) { const li = document.createElement('li'); li.textContent = 'Ingen betalinger denne måneden.'; list.append(li); }
    for (const [name, value] of [...sums].sort((a, b) => b[1] - a[1])) {
      const li = document.createElement('li'); const label = document.createElement('span'); label.textContent = name;
      const amount = document.createElement('strong'); amount.textContent = money(value); li.append(label, amount); list.append(li);
    }
  }
  async function refresh() {
    if (!state.user) return;
    const revision = ++state.revision;
    const b = getBudget(state.selected);
    const month = monthlyRange($('dashboard-month').value);
    const chosen = b && period(b, state.offset);
    const fields = 'id,user_id,budget_id,store_name,amount,category,payment_scope,actor_name,description,purchase_date,created_at';
    const fetchPeriod = (start, end, budgetId) => fetchAll('transactions', fields, q => {
      q = q.gte('purchase_date', start).lt('purchase_date', end).order('purchase_date', { ascending: false }).order('created_at', { ascending: false });
      return budgetId ? q.eq('budget_id', budgetId) : q;
    });
    try {
      const [monthRows, periodRows] = await Promise.all([
        fetchPeriod(month.start, month.end),
        chosen ? fetchPeriod(chosen.start, nextDate(chosen.end), b.id) : Promise.resolve([])
      ]);
      if (revision !== state.revision) return;
      displayDashboard(monthRows);
      displayDetail(b, periodRows);
      displayTransactions(b ? periodRows : monthRows, Boolean(b));
    } catch (err) { if (revision === state.revision) status(`Kunne ikke hente betalinger: ${err.message}`); }
  }
  function initialize() {
    $('dashboard-month').value = today().slice(0, 7);
    $('trans-date').value = today(); $('budget-start').value = today();
    $('budget-end').value = dateString(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
    for (const category of categories) $('trans-category').add(new Option(category, category));
    $('tab-login').onclick = () => { $('login-form').classList.remove('hidden'); $('signup-form').classList.add('hidden'); $('tab-login').classList.add('active'); $('tab-signup').classList.remove('active'); clearStatus('auth-error'); };
    $('tab-signup').onclick = () => { $('signup-form').classList.remove('hidden'); $('login-form').classList.add('hidden'); $('tab-signup').classList.add('active'); $('tab-login').classList.remove('active'); clearStatus('auth-error'); };
    if (!db) { status('Kunne ikke laste Supabase.', 'error', 'auth-error'); return; }
    $('signup-form').onsubmit = async event => {
      event.preventDefault(); clearStatus('auth-error');
      const { data, error } = await db.auth.signUp({ email: $('signup-email').value.trim(), password: $('signup-password').value,
        options: { data: { first_name: $('signup-firstname').value.trim(), last_name: $('signup-lastname').value.trim(), username: $('signup-username').value.trim() } } });
      if (error) return status(`Registrering feilet: ${error.message}`, 'error', 'auth-error');
      $('signup-form').reset();
      if (!data.session) { $('tab-login').click(); status('Konto opprettet. Bekreft e-posten før du logger inn.', 'success', 'auth-error'); }
    };
    $('login-form').onsubmit = async event => {
      event.preventDefault(); clearStatus('auth-error');
      const { error } = await db.auth.signInWithPassword({ email: $('login-email').value.trim(), password: $('login-password').value });
      if (error) status(`Innlogging feilet: ${error.message}`, 'error', 'auth-error');
    };
    $('logout-btn').onclick = async () => { const { error } = await db.auth.signOut(); if (error) status(error.message); };
    $('budget-form').onsubmit = async event => {
      event.preventDefault(); clearStatus();
      const start = $('budget-start').value, end = $('budget-end').value;
      if (!start || !end || end < start || end >= shiftMonth(start, 1)) return status('Sluttdato må være etter startdato og før neste måneds start.');
      const { data, error } = await db.from('budgets').insert({ created_by: state.user.id, title: $('budget-name').value.trim(),
        total_amount: Number($('budget-limit').value), start_date: start, end_date: end, kind: $('budget-type').value }).select('id').single();
      if (error) return status(`Kunne ikke opprette budsjett: ${error.message}`);
      $('budget-form').reset(); $('budget-start').value = today(); $('budget-end').value = dateString(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
      await loadBudgets(); selectBudget(data.id); status('Budsjettet er opprettet.', 'success');
    };
    $('selected-budget').onchange = event => selectBudget(event.target.value);
    $('trans-budget').onchange = updateScope;
    $('previous-period').onclick = () => { state.offset = Math.max(0, state.offset - 1); refresh(); };
    $('next-period').onclick = () => { state.offset++; refresh(); };
    $('dashboard-month').onchange = refresh;
    $('share-form').onsubmit = async event => {
      event.preventDefault(); const b = getBudget(state.selected);
      if (!b || b.owner_id !== state.user?.id) return;
      const { data, error } = await db.rpc('add_budget_member', { p_budget: b.id, p_identifier: $('share-identifier').value.trim() });
      if (error) return status(`Kunne ikke dele: ${error.message}`);
      $('share-form').reset(); status(`Lagt til: ${data}`, 'success'); loadMembers(b);
    };
    $('transaction-form').onsubmit = async event => {
      event.preventDefault(); clearStatus();
      const b = getBudget($('trans-budget').value);
      const scope = b?.kind === 'shared' ? $('trans-scope').value : 'personal';
      if (b && $('trans-date').value < b.first_start) return status('Betalingsdato er før budsjettets første periode.');
      const { error } = await db.from('transactions').insert({ user_id: state.user.id, budget_id: b?.id || null,
        store_name: $('trans-store').value.trim(), amount: Number($('trans-amount').value), description: $('trans-desc').value.trim() || null,
        purchase_date: $('trans-date').value, category: $('trans-category').value, payment_scope: scope });
      if (error) return status(`Kunne ikke lagre betaling: ${error.message}`);
      $('transaction-form').reset(); $('trans-date').value = today(); $('trans-budget').value = b?.id || ''; updateScope();
      status('Betalingen er lagret.', 'success'); await refresh();
    };
    db.auth.onAuthStateChange((event, session) => {
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
