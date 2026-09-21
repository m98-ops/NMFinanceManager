// CONFIG: Erstatt med dine Supabase-detaljer fra Dashboard > Project Settings > API
const SUPABASE_URL = 'https://nbrqtupxrlrfhwodigou.supabase.com';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5icnF0dXB4cmxyZmh3b2RpZ291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDU4NzIsImV4cCI6MjEwNTU4MTg3Mn0.FicNmSAkaDP1q0I70SlmD7iD3LZ52lMhFtNufPgjzQ0';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM-elementer
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const userInfo = document.getElementById('user-info');
const userNameDisplay = document.getElementById('user-name');

const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');

const transactionForm = document.getElementById('transaction-form');
const transactionsList = document.getElementById('transactions-list');
const totalSpentDisplay = document.getElementById('total-spent').querySelector('span');
const transDateInput = document.getElementById('trans-date');

// Sett dagens dato som standard i skjemafeltet
transDateInput.valueAsDate = new Date();

let currentUser = null;

// --- FANE-NAVIGASJON (INNLOKKING / REGISTRERING) ---
tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabSignup.classList.remove('active');
  loginForm.classList.remove('hidden');
  signupForm.classList.add('hidden');
});

tabSignup.addEventListener('click', () => {
  tabSignup.classList.add('active');
  tabLogin.classList.remove('active');
  signupForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
});

// --- AUTENTISERING ---

// Registrer bruker
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
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
    alert('Feil ved registrering: ' + error.message);
  } else {
    alert('Bruker opprettet! Sjekk e-post for bekreftelse eller prøv å logge inn.');
  }
});

// Logg inn
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    alert('Feil ved innlogging: ' + error.message);
  } else {
    checkUserSession();
  }
});

// Logg ut
document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  checkUserSession();
});

// --- SJEKK INNLOGGINGSTILSTAND ---
async function checkUserSession() {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session) {
    currentUser = session.user;
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    userInfo.classList.remove('hidden');
    
    // Vis brukernavn/navn i toppen
    const name = currentUser.user_metadata.first_name || currentUser.email;
    userNameDisplay.textContent = `Hei, ${name}`;

    // Last inn transaksjoner
    loadTransactions();
  } else {
    currentUser = null;
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
    userInfo.classList.add('hidden');
  }
}

// --- TRANSAKSJONER ---

// Opprett ny transaksjon
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
    transDateInput.valueAsDate = new Date(); // tilbakestill dato
    loadTransactions(); // oppdater listen
  }
});

// Last inn og vis transaksjoner
async function loadTransactions() {
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
    li.innerHTML = `
      <div>
        <span class="trans-store">${trans.store_name}</span>
        <span class="trans-desc">${trans.description || ''}</span>
        <div class="trans-meta">${trans.purchase_date}</div>
      </div>
      <div class="trans-amount">${Number(trans.amount).toFixed(2)} kr</div>
    `;
    transactionsList.appendChild(li);
  });

  totalSpentDisplay.textContent = total.toFixed(2);
}

// Kjør sjekk ved oppstart
checkUserSession();