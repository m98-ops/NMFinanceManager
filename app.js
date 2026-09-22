const SUPABASE_URL = 'https://nbrqtupxrlrfhwodigou.supabase.com';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5icnF0dXB4cmxyZmh3b2RpZ291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDU4NzIsImV4cCI6MjEwNTU4MTg3Mn0.FicNmSAkaDP1q0I70SlmD7iD3LZ52lMhFtNufPgjzQ0';

// Initialiser Supabase-klienten
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// DOM-elementer
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const userInfo = document.getElementById('user-info');
const userNameDisplay = document.getElementById('user-name');
const authError = document.getElementById('auth-error');

const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');

const transactionForm = document.getElementById('transaction-form');
const transactionsList = document.getElementById('transactions-list');
const totalSpentDisplay = document.getElementById('total-spent') ? document.getElementById('total-spent').querySelector('span') : null;
const transDateInput = document.getElementById('trans-date');

if (transDateInput) {
  transDateInput.valueAsDate = new Date();
}

let currentUser = null;

// Hjælpefunksjon for feilmeldinger
function showError(msg) {
  if (!authError) return;
  authError.textContent = msg;
  authError.classList.remove('hidden');
}

function clearError() {
  if (!authError) return;
  authError.textContent = '';
  authError.classList.add('hidden');
}

// --- BYTTE FANE (LOGG INN / REGISTRER DEG) ---
if (tabLogin && tabSignup) {
  tabLogin.addEventListener('click', (e) => {
    e.preventDefault();
    clearError();
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
  });

  tabSignup.addEventListener('click', (e) => {
    e.preventDefault();
    clearError();
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  });
}

// --- AUTENTISERING ---

// Registrering
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    if (!supabase) {
      showError("Kunne ikke koble til Supabase.");
      return;
    }

    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const firstName = document.getElementById('signup-firstname').value;
    const lastName = document.getElementById('signup-lastname').value;
    const username = document.getElementById('signup-username').value;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          username: username
        }
      }
    });

    if (error) {
      showError('Feil ved registrering: ' + error.message);
    } else {
      alert('Bruker opprettet! Sjekk din e-post hvis du må bekrefte kontoen, eller prøv å logge inn.');
      tabLogin.click();
    }
  });
}

// Innlogging
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    if (!supabase) {
      showError("Kunne ikke koble til Supabase.");
      return;
    }

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        showError("Feil e-post eller passord. Brukeren finnes enten ikke eller passordet er feil.");
      } else {
        showError("Feil ved innlogging: " + error.message);
      }
    } else {
      checkUserSession();
    }
  });
}

// Logg ut
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    if (supabase) await supabase.auth.signOut();
    checkUserSession();
  });
}

// --- SJEKK ØKT ---
async function checkUserSession() {
  if (!supabase) return;

  const { data: { session } } = await supabase.auth.getSession();
  
  if (session) {
    currentUser = session.user;
    if (authSection) authSection.classList.add('hidden');
    if (appSection) appSection.classList.remove('hidden');
    if (userInfo) userInfo.classList.remove('hidden');
    
    const name = currentUser.user_metadata?.first_name || currentUser.email;
    if (userNameDisplay) userNameDisplay.textContent = `Hei, ${name}`;

    loadTransactions();
  } else {
    currentUser = null;
    if (authSection) authSection.classList.remove('hidden');
    if (appSection) appSection.classList.add('hidden');
    if (userInfo) userInfo.classList.add('hidden');
  }
}

// --- TRANSAKSJONER ---
if (transactionForm) {
  transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const store = document.getElementById('trans-store').value;
    const amount = parseFloat(document.getElementById('trans-amount').value);
    const description = document.getElementById('trans-desc').value;
    const purchaseDate = document.getElementById('trans-date').value;

    const { data, error } = await supabase
      .from('transactions')
      .insert([
        {
          user_id: currentUser.id,
          store_name: store,
          amount: amount,
          description: description,
          purchase_date: purchaseDate
        }
      ]);

    if (error) {
      alert('Feil ved lagring: ' + error.message);
    } else {
      transactionForm.reset();
      if (transDateInput) transDateInput.valueAsDate = new Date();
      loadTransactions();
    }
  });
}

async function loadTransactions() {
  if (!transactionsList || !supabase) return;

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('purchase_date', { ascending: false });

  if (error) {
    console.error('Feil ved henting av transaksjoner:', error);
    return;
  }

  transactionsList.innerHTML = '';
  let total = 0;

  data.forEach(trans => {
    total += Number(trans.amount);

    const li = document.createElement('li');
    li.className = 'transaction-item';
    const details = document.createElement('div');
    const store = document.createElement('span');
    store.className = 'trans-store';
    store.textContent = trans.store_name;
    const description = document.createElement('span');
    description.className = 'trans-desc';
    description.textContent = trans.description || '';
    const meta = document.createElement('div');
    meta.className = 'trans-meta';
    meta.textContent = trans.purchase_date;
    details.append(store, description, meta);
    const amount = document.createElement('div');
    amount.className = 'trans-amount';
    amount.textContent = `${Number(trans.amount).toFixed(2)} kr`;
    li.append(details, amount);
    transactionsList.appendChild(li);
  });

  if (totalSpentDisplay) {
    totalSpentDisplay.textContent = total.toFixed(2);
  }
}

// Kjør sjekk ved oppstart
checkUserSession();