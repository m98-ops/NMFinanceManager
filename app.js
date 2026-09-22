const SUPABASE_URL = 'https://nbrqtupxrlrfhwodigou.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5icnF0dXB4cmxyZmh3b2RpZ291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDU4NzIsImV4cCI6MjEwNTU4MTg3Mn0.FicNmSAkaDP1q0I70SlmD7iD3LZ52lMhFtNufPgjzQ0';

(() => {
  'use strict';

  const init = () => {
    const supabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) ?? null;

    const authSection = document.getElementById('auth-section');
    const appSection = document.getElementById('app-section');
    const userInfo = document.getElementById('user-info');
    const userNameDisplay = document.getElementById('user-name');
    const authError = document.getElementById('auth-error');
    const appMessage = document.getElementById('app-message');
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const transactionForm = document.getElementById('transaction-form');
    const transactionsList = document.getElementById('transactions-list');
    const totalSpent = document.querySelector('#total-spent span');
    const transDateInput = document.getElementById('trans-date');
    const logoutBtn = document.getElementById('logout-btn');

    let currentUser = null;

    const error = (message) => {
      if (authError) {
        authError.textContent = message;
        authError.classList.remove('hidden');
      }
    };

    const clearError = () => {
      if (authError) {
        authError.textContent = '';
        authError.classList.add('hidden');
      }
    };

    const message = (text, type = 'info') => {
      if (!appMessage) return;
      appMessage.textContent = text;
      appMessage.className = `message ${type}`;
    };

    const switchTab = (login) => {
      clearError();
      tabLogin?.classList.toggle('active', login);
      tabSignup?.classList.toggle('active', !login);
      loginForm?.classList.toggle('hidden', !login);
      signupForm?.classList.toggle('hidden', login);
    };

    tabLogin?.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(true);
    });

    tabSignup?.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(false);
    });

    if (!supabase) {
      error('Kunne ikke laste Supabase. Kontroller at Supabase CDN er tilgjengelig.');
    }

    signupForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();
      if (!supabase) return error('Supabase er ikke tilgjengelig.');

      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;
      const firstName = document.getElementById('signup-firstname').value.trim();
      const lastName = document.getElementById('signup-lastname').value.trim();
      const username = document.getElementById('signup-username').value.trim();

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { first_name: firstName, last_name: lastName, username } }
      });

      if (signUpError) {
        error(`Feil ved registrering: ${signUpError.message}`);
        return;
      }

      alert('Bruker opprettet. Sjekk e-posten dersom kontoen krever bekreftelse.');
      signupForm.reset();
      switchTab(true);
    });

    loginForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();
      if (!supabase) return error('Supabase er ikke tilgjengelig.');

      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });

      if (loginError) {
        error(loginError.message.includes('Invalid login credentials')
          ? 'Feil e-post eller passord.'
          : `Feil ved innlogging: ${loginError.message}`);
        return;
      }
      await checkSession();
    });

    logoutBtn?.addEventListener('click', async () => {
      if (!supabase) return;
      const { error: logoutError } = await supabase.auth.signOut();
      if (logoutError) return message(`Kunne ikke logge ut: ${logoutError.message}`, 'error');
      currentUser = null;
      showLoggedOut();
    });

    transactionForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!supabase || !currentUser) return message('Du må være innlogget.', 'error');

      const store = document.getElementById('trans-store').value.trim();
      const amount = Number.parseFloat(document.getElementById('trans-amount').value);
      const description = document.getElementById('trans-desc').value.trim() || null;
      const purchaseDate = transDateInput.value;

      if (!store || !Number.isFinite(amount) || amount <= 0 || !purchaseDate) {
        return message('Kontroller butikk, beløp og dato.', 'error');
      }

      const { error: insertError } = await supabase.from('transactions').insert({
        user_id: currentUser.id,
        store_name: store,
        amount,
        description,
        purchase_date: purchaseDate
      });

      if (insertError) return message(`Feil ved lagring: ${insertError.message}`, 'error');

      transactionForm.reset();
      transDateInput.valueAsDate = new Date();
      message('Kjøpet er lagret.', 'success');
      await loadTransactions();
    });

    function showLoggedIn() {
      authSection?.classList.add('hidden');
      appSection?.classList.remove('hidden');
      userInfo?.classList.remove('hidden');
      userNameDisplay.textContent = `Hei, ${currentUser.user_metadata?.first_name || currentUser.email}`;
      loadTransactions();
    }

    function showLoggedOut() {
      authSection?.classList.remove('hidden');
      appSection?.classList.add('hidden');
      userInfo?.classList.add('hidden');
    }

    async function checkSession() {
      if (!supabase) return;
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) return error(`Kunne ikke hente session: ${sessionError.message}`);
      currentUser = data.session?.user ?? null;
      currentUser ? showLoggedIn() : showLoggedOut();
    }

    async function loadTransactions() {
      if (!supabase || !currentUser || !transactionsList) return;

      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

      const { data, error: loadError } = await supabase
        .from('transactions')
        .select('id, store_name, amount, description, purchase_date, created_at')
        .eq('user_id', currentUser.id)
        .gte('purchase_date', isoDate(start))
        .lt('purchase_date', isoDate(end))
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (loadError) return message(`Kunne ikke hente transaksjoner: ${loadError.message}`, 'error');

      transactionsList.replaceChildren();
      let total = 0;

      if (!data?.length) {
        const empty = document.createElement('li');
        empty.className = 'empty-item';
        empty.textContent = 'Ingen kjøp registrert denne måneden.';
        transactionsList.appendChild(empty);
      }

      for (const trans of data ?? []) {
        total += Number(trans.amount) || 0;
        const li = document.createElement('li');
        li.className = 'transaction-item';

        const details = document.createElement('div');
        const store = document.createElement('span');
        store.className = 'trans-store';
        store.textContent = trans.store_name;
        const desc = document.createElement('span');
        desc.className = 'trans-desc';
        desc.textContent = trans.description || '';
        const meta = document.createElement('div');
        meta.className = 'trans-meta';
        meta.textContent = trans.purchase_date;
        details.append(store, desc, meta);

        const amount = document.createElement('div');
        amount.className = 'trans-amount';
        amount.textContent = `${(Number(trans.amount) || 0).toFixed(2)} kr`;
        li.append(details, amount);
        transactionsList.appendChild(li);
      }

      if (totalSpent) totalSpent.textContent = total.toFixed(2);
    }

    if (transDateInput) transDateInput.valueAsDate = new Date();

    supabase?.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user ?? null;
      currentUser ? showLoggedIn() : showLoggedOut();
    });

    checkSession();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
