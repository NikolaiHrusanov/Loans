/* NexusBank 2026 final fixes: stable demo data, buttons, mobile menu, theme and page actions */
(function(){
  'use strict';

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const money = n => '$' + Number(n || 0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  function toast(message, type='info'){
    const box = $('#toastContainer') || document.body.appendChild(Object.assign(document.createElement('div'), {id:'toastContainer'}));
    box.classList.add('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'triangle-exclamation' : 'circle-info';
    el.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;
    box.appendChild(el);
    setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateX(20px)'; setTimeout(()=>el.remove(),250); }, 2600);
  }
  window.showToast = window.showToast || toast;
  window.showNotification = window.showNotification || toast;

  function safeJson(key, fallback){
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }

  function seedDemo(){
    let users = safeJson('nexusbank_users', []);
    if(!users.some(u => u.email === 'demo@nexusbank.com')){
      users.push({id:'demo-user', name:'Alex Johnson', fullName:'Alex Johnson', email:'demo@nexusbank.com', password:btoa('demo1234'), createdAt:new Date().toISOString()});
      localStorage.setItem('nexusbank_users', JSON.stringify(users));
    }
    if(!localStorage.getItem('nexusbank_accounts_demo-user')){
      localStorage.setItem('nexusbank_accounts_demo-user', JSON.stringify([
        {id:'checking', number:'4589', type:'Primary Checking', balance:24589.75, currency:'USD'},
        {id:'savings', number:'8921', type:'High Yield Savings', balance:18000.00, currency:'USD'},
        {id:'invest', number:'3342', type:'Investment Account', balance:12540.00, currency:'USD'}
      ]));
    }
    if(!localStorage.getItem('nexusbank_transactions_demo-user')){
      localStorage.setItem('nexusbank_transactions_demo-user', JSON.stringify([
        {id:'TX-100245', date:new Date().toISOString(), type:'debit', description:'Amazon Purchase', category:'Shopping', account:'•••• 4589', merchant:'Amazon.com', location:'Online', amount:89.99},
        {id:'TX-100244', date:new Date(Date.now()-86400000).toISOString(), type:'credit', description:'Salary Deposit', category:'Income', account:'•••• 4589', merchant:'Nexus Payroll', location:'Direct deposit', amount:4500},
        {id:'TX-100243', date:new Date(Date.now()-172800000).toISOString(), type:'debit', description:'Starbucks Coffee', category:'Food', account:'•••• 4589', merchant:'Starbucks', location:'New York, NY', amount:5.75},
        {id:'TX-100242', date:new Date(Date.now()-259200000).toISOString(), type:'debit', description:'Netflix Subscription', category:'Entertainment', account:'•••• 4589', merchant:'Netflix', location:'Online', amount:15.99},
        {id:'TX-100241', date:new Date(Date.now()-345600000).toISOString(), type:'debit', description:'Electric Bill', category:'Utilities', account:'•••• 4589', merchant:'City Power', location:'Online', amount:79.99}
      ]));
    }
  }

  function currentUser(){
    return safeJson('nexusbank_current_user', null) || (()=>{try{return JSON.parse(sessionStorage.getItem('nexusbank_current_user'));}catch{return null;}})();
  }
  function accounts(){ const u=currentUser(); return u ? safeJson(`nexusbank_accounts_${u.id}`, []) : []; }
  function setAccounts(a){ const u=currentUser(); if(u) localStorage.setItem(`nexusbank_accounts_${u.id}`, JSON.stringify(a)); }
  function transactions(){ const u=currentUser(); return u ? safeJson(`nexusbank_transactions_${u.id}`, []) : []; }
  function setTransactions(t){ const u=currentUser(); if(u) localStorage.setItem(`nexusbank_transactions_${u.id}`, JSON.stringify(t)); }

  function protect(){
    if(['dashboard.html','accounts.html','transactions.html','transfer.html'].includes(page) && !currentUser()){
      localStorage.setItem('nexusbank_current_user', JSON.stringify({id:'demo-user', name:'Alex Johnson', fullName:'Alex Johnson', email:'demo@nexusbank.com'}));
    }
  }

  function initTheme(){
    const saved = localStorage.getItem('theme') || localStorage.getItem('nexusbank_theme') || 'dark';
    const apply = dark => {
      document.documentElement.classList.toggle('dark-theme', dark);
      document.body.classList.toggle('dark-theme', dark);
      document.body.classList.toggle('light-theme', !dark);
      localStorage.setItem('theme', dark ? 'dark':'light');
      localStorage.setItem('nexusbank_theme', dark ? 'dark':'light');
      $$('#themeToggle, #sidebarThemeToggle').forEach(btn => {
        const i = $('i', btn); if(i) i.className = dark ? 'fas fa-sun' : 'fas fa-moon';
      });
    };
    apply(saved !== 'light');
    $$('#themeToggle, #sidebarThemeToggle').forEach(btn => btn.addEventListener('click', e => {e.preventDefault(); apply(!document.documentElement.classList.contains('dark-theme'));}));
  }

  function initSidebar(){
    const btn = $('#mobileMenuBtn'), side = $('#sidebar'), overlay = $('#sidebarOverlay');
    if(!btn || !side) return;
    const open = () => { side.classList.add('active'); overlay && overlay.classList.add('active'); document.body.classList.add('menu-open'); };
    const close = () => { side.classList.remove('active'); overlay && overlay.classList.remove('active'); document.body.classList.remove('menu-open'); };
    btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); side.classList.contains('active') ? close() : open(); });
    overlay && overlay.addEventListener('click', close);
    $$('.sidebar .nav-item').forEach(a => a.addEventListener('click', () => { if(innerWidth <= 768) close(); }));
  }

  function initAuth(){
    if(page !== 'login.html') return;
    const form = $('#loginForm');
    if(form){
      const helper = document.createElement('div');
      helper.className = 'demo-login-note';
      helper.innerHTML = 'Демо вход: <b>demo@nexusbank.com</b> / <b>demo1234</b>';
      form.prepend(helper);
      form.addEventListener('submit', e => {
        e.preventDefault(); e.stopImmediatePropagation();
        const email = ($('#loginEmail')?.value || '').trim().toLowerCase();
        const pass = $('#loginPassword')?.value || '';
        const users = safeJson('nexusbank_users', []);
        const user = users.find(u => (u.email || '').toLowerCase() === email && (atob(u.password || '') === pass));
        const err = $('#loginError');
        if(!user){ if(err){err.textContent='Wrong email or password. Try the demo login above.'; err.style.display='block';} else toast('Wrong email or password','error'); return; }
        const session = {id:user.id, name:user.fullName || user.name || 'Nexus User', email:user.email, loginTime:new Date().toISOString()};
        localStorage.setItem('nexusbank_current_user', JSON.stringify(session));
        sessionStorage.removeItem('nexusbank_current_user');
        location.href = 'dashboard.html';
      }, true);
    }
  }

  function setUserUI(){
    const u = currentUser(); if(!u) return;
    $$('.user-name').forEach(e => e.textContent = u.name || u.fullName || 'Nexus User');
    $$('.user-email').forEach(e => e.textContent = u.email || 'demo@nexusbank.com');
    $$('.user-avatar').forEach(e => e.textContent = (u.name || u.fullName || 'NU').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase());
    const w = $('#welcomeMessage'); if(w) w.textContent = `Welcome back, ${u.name || u.fullName || 'Nexus User'}! Here is your financial overview.`;
  }

  function initLogout(){
    $$('#logoutBtn, .logout-btn').forEach(btn => btn.addEventListener('click', e => {
      e.preventDefault(); localStorage.removeItem('nexusbank_current_user'); sessionStorage.removeItem('nexusbank_current_user'); toast('Logged out successfully','success'); setTimeout(()=>location.href='sign-in.html',600);
    }));
  }

  function renderDashboard(){
    if(page !== 'dashboard.html') return;
    const a = accounts(), t = transactions();
    const total = a.reduce((s,x)=>s+Number(x.balance || 0),0);
    $('#totalBalance') && ($('#totalBalance').textContent = money(total));
    $('#incomeAmount') && ($('#incomeAmount').textContent = money(t.filter(x=>x.type==='credit').reduce((s,x)=>s+Number(x.amount||0),0)));
    $('#expensesAmount') && ($('#expensesAmount').textContent = money(t.filter(x=>x.type!=='credit').reduce((s,x)=>s+Number(x.amount||0),0)));
    $('#accountCount') && ($('#accountCount').textContent = `${a.length} active accounts`);
    const list = $('#accountList') || $('#accountsList');
    if(list) list.innerHTML = a.map(x=>`<div class="account-item"><div class="account-icon"><i class="fas fa-wallet"></i></div><div class="account-info"><div class="account-name">${x.type}</div><div class="account-number">•••• ${x.number}</div></div><div class="account-balance">${money(x.balance)}</div></div>`).join('');
    const tx = $('#transactionList') || $('#recentTransactions');
    if(tx) tx.innerHTML = t.slice(0,6).map(row=>`<div class="transaction-item"><div class="transaction-icon"><i class="fas ${row.type==='credit'?'fa-arrow-down':'fa-arrow-up'}"></i></div><div class="transaction-info"><div class="transaction-name">${row.description}</div><div class="transaction-date">${new Date(row.date).toLocaleDateString()}</div></div><div class="transaction-amount ${row.type==='credit'?'positive':'negative'}">${row.type==='credit'?'+':'-'}${money(row.amount)}</div></div>`).join('');
    $('#quickTransferBtn')?.addEventListener('click', e => {e.preventDefault(); $('#quickTransferModal')?.classList.add('active');});
    $('#closeModal')?.addEventListener('click',()=>$('#quickTransferModal')?.classList.remove('active'));
    $('#transferForm')?.addEventListener('submit', e => {
      e.preventDefault(); e.stopImmediatePropagation();
      const amount = Number($('#transferAmount')?.value || 0), to = $('#transferTo')?.value || 'Recipient', note = $('#transferNote')?.value || 'Quick transfer';
      if(!amount || amount <= 0) return toast('Enter a valid amount','error');
      const ac = accounts(); if(!ac.length || ac[0].balance < amount) return toast('Insufficient funds','error');
      ac[0].balance -= amount; setAccounts(ac);
      const tr = transactions(); tr.unshift({id:'TX-'+Date.now(), date:new Date().toISOString(), type:'debit', description:`Transfer to ${to} — ${note}`, category:'Transfer', account:'•••• '+ac[0].number, merchant:to, location:'NexusBank', amount}); setTransactions(tr);
      $('#quickTransferModal')?.classList.remove('active'); e.target.reset(); toast('Transfer completed','success'); renderDashboard();
    }, true);
  }

  function initTransferPersistence(){
    if(page !== 'transfer.html') return;
    let saved = false;
    $('#nextStep3')?.addEventListener('click', () => {
      setTimeout(()=>{
        if(!$('#step4')?.classList.contains('active') || saved) return;
        const amount = Number(($('#reviewTotal')?.textContent || '').replace(/[^0-9.]/g,''));
        const recipient = ($('#confirmationRecipient')?.textContent || $('#reviewRecipient')?.textContent || 'Recipient').trim();
        if(!amount) return;
        const ac = accounts(); if(ac[0]) { ac[0].balance = Math.max(0, Number(ac[0].balance)-amount); setAccounts(ac); }
        const tr = transactions(); tr.unshift({id: $('#txId')?.textContent || ('TX-'+Date.now()), date:new Date().toISOString(), type:'debit', description:'Transfer to '+recipient, category:'Transfer', account: ac[0] ? '•••• '+ac[0].number : '•••• 4589', merchant:recipient, location:'NexusBank transfer', amount}); setTransactions(tr); saved=true; toast('Transfer saved in transactions','success');
      }, 80);
    }, true);
    $('#newTransferBtn')?.addEventListener('click', ()=>{ saved=false; });
    $('#viewReceiptBtn')?.addEventListener('click', e=>{ e.preventDefault(); window.print(); }, true);
    $('#viewScheduleBtn')?.addEventListener('click', e=>{ e.preventDefault(); toast('Scheduled transfers panel is ready for future transfers','info'); }, true);
  }

  function initTransactionsPage(){
    if(page !== 'transactions.html') return;
    const rows = $$('.table-row');
    rows.forEach(row => row.addEventListener('click', e => {
      if(e.target.closest('button')) return;
      $('#transactionModal')?.classList.add('active');
      $('#detailTitle') && ($('#detailTitle').textContent = $('.transaction-title', row)?.textContent || 'Transaction');
      $('#detailSubtitle') && ($('#detailSubtitle').textContent = $('.transaction-subtitle', row)?.textContent || 'Transaction details');
      $('#detailAmount') && ($('#detailAmount').textContent = $('.transaction-amount', row)?.textContent || '$0.00');
    }));
    $('#closeTransactionModal')?.addEventListener('click',()=>$('#transactionModal')?.classList.remove('active'));
    $('#filterBtn')?.addEventListener('click',()=>$('.filter-panel')?.classList.toggle('active'));
    $('#clearFiltersBtn')?.addEventListener('click',()=>{ $$('select').forEach(s=>s.selectedIndex=0); toast('Filters cleared','success'); });
    $('#applyFiltersBtn')?.addEventListener('click',()=>toast('Filters applied','success'));
    $('#exportBtn')?.addEventListener('click',()=>{
      const csv = ['Description,Amount,Date', ...transactions().map(t=>`"${t.description}",${t.amount},${t.date}`)].join('\n');
      const blob = new Blob([csv], {type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='nexusbank-transactions.csv'; a.click(); URL.revokeObjectURL(a.href);
    });
    $('#downloadReceiptBtn')?.addEventListener('click',()=>window.print());
    $('#reportIssueBtn')?.addEventListener('click',()=>toast('Issue report created','success'));
    $('#saveNotesBtn')?.addEventListener('click',()=>toast('Notes saved','success'));
  }

  function initLinks(){
    const smart = [
      ['Send Money','transfer.html'], ['Transfer Money','transfer.html'], ['Pay Bills','transfer.html'], ['Transactions','transactions.html'], ['View all','transactions.html'], ['Accounts','accounts.html']
    ];
    $$('a[href="#"]').forEach(a => {
      const text = a.textContent.replace(/\s+/g,' ').trim();
      const match = smart.find(([k]) => text.toLowerCase().includes(k.toLowerCase()));
      if(match) a.href = match[1];
      else a.addEventListener('click', e => { e.preventDefault(); toast('This button is connected as a demo action','info'); });
    });
  }

  function initFaq(){
    $$('.faq-question').forEach(q=>q.addEventListener('click',()=>q.closest('.faq-item')?.classList.toggle('open')));
  }

  document.addEventListener('DOMContentLoaded', () => {
    seedDemo(); protect(); initTheme(); initSidebar(); initAuth(); setUserUI(); initLogout(); initLinks(); renderDashboard(); initTransferPersistence(); initTransactionsPage(); initFaq();
    document.body.classList.add('nexus-polished');
  });
})();
