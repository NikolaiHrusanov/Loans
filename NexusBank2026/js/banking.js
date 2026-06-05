/**
 * NexusBank — load per-user accounts & transactions from Supabase; bank statements.
 */
(function () {
  'use strict';

  const TX_ICONS = {
    building: 'fa-building',
    shopping: 'fa-shopping-bag',
    coffee: 'fa-coffee',
    percentage: 'fa-percentage',
    phone: 'fa-phone-alt',
    deposit: 'fa-arrow-down',
    transfer: 'fa-exchange-alt',
    default: 'fa-receipt',
  };

  function getClient() {
    return window.NexusAuth?.supabase;
  }

  function formatCurrency(amount) {
    const n = Number(amount) || 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  }

  function formatTxDate(iso) {
    const d = new Date(iso);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTx = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((startOfToday - startOfTx) / 86400000);
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    if (diffDays === 0) return `Today, ${time}`;
    if (diffDays === 1) return `Yesterday, ${time}`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatStatementDate(iso) {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function txIconClass(iconKey, type) {
    const key = (iconKey || '').toLowerCase();
    return TX_ICONS[key] || TX_ICONS.default;
  }

  async function ensureBanking() {
    const client = getClient();
    if (!client) throw new Error('Supabase client not ready');

    const { data, error } = await client.rpc('ensure_user_banking');
    if (error) {
      console.warn('ensure_user_banking:', error.message);
      const { count, error: countError } = await client
        .from('bank_accounts')
        .select('*', { count: 'exact', head: true });
      if (countError || !count) throw error;
    }
    return data;
  }

  async function fetchAccounts() {
    const client = getClient();
    const { data, error } = await client
      .from('bank_accounts')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async function fetchRecentTransactions(limit = 10) {
    if (window.NexusMoney?.fetchMoneyTransactions) {
      return window.NexusMoney.fetchMoneyTransactions(limit);
    }
    const client = getClient();
    const { data, error } = await client
      .from('transactions')
      .select('*, bank_accounts(account_name, account_type, account_number_last4)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  async function fetchAllTransactions() {
    if (window.NexusMoney?.fetchMoneyTransactions) {
      return window.NexusMoney.fetchMoneyTransactions();
    }
    const client = getClient();
    const { data, error } = await client
      .from('transactions')
      .select('*, bank_accounts(account_name, account_type, account_number_last4)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  function accountTypeLabel(type) {
    const map = { checking: 'Checking', savings: 'Savings', investment: 'Investment' };
    return map[type] || type;
  }

  function renderAccountCard(account) {
    const type = account.account_type || 'checking';
    const apyLine =
      account.apy != null
        ? `<div class="account-change positive">
            <i class="fas fa-arrow-up" style="font-size:0.65rem"></i>
            ${account.apy}% APY
          </div>`
        : `<div class="account-change positive">
            <i class="fas fa-check" style="font-size:0.65rem"></i>
            Active account
          </div>`;

    return `
      <div class="account-card" data-account-id="${account.id}">
        <div class="account-card-header">
          <span class="account-type-badge ${type}">
            <i class="fas fa-circle" style="font-size:0.45rem"></i> ${accountTypeLabel(type)}
          </span>
          <button type="button" class="account-more-btn" aria-label="Account options">
            <i class="fas fa-ellipsis-h"></i>
          </button>
        </div>
        <div class="account-name">${escapeHtml(account.account_name)}</div>
        <div class="account-number">**** ${escapeHtml(account.account_number_last4)}</div>
        <div class="account-balance">${formatCurrency(account.balance)}</div>
        ${apyLine}
        <div class="account-actions">
          <a href="transfer.html" class="btn-sm btn-sm-primary">
            <i class="fas fa-exchange-alt"></i> Transfer
          </a>
          <button type="button" class="btn-sm btn-sm-ghost js-view-statement" data-account-id="${account.id}">
            <i class="fas fa-file-alt"></i> Statement
          </button>
        </div>
      </div>`;
  }

  function renderTransactionItem(tx) {
    if (tx.type && window.NexusMoney?.renderMoneyTransactionRow) {
      return window.NexusMoney.renderMoneyTransactionRow(tx);
    }

    const type = tx.transaction_type === 'credit' ? 'credit' : 'debit';
    const sign = type === 'credit' ? '+' : '-';
    const icon = txIconClass(tx.icon, type);

    return `
      <div class="tx-item">
        <div class="tx-icon ${type}">
          <i class="fas ${icon}"></i>
        </div>
        <div class="tx-details">
          <div class="tx-name">${escapeHtml(tx.description)}</div>
          <div class="tx-date">${formatTxDate(tx.created_at)}</div>
        </div>
        <div class="tx-amount ${type}">${sign}${formatCurrency(tx.amount)}</div>
      </div>`;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildStatementHtml({ userName, userEmail, accounts, transactions, generatedAt }) {
    const total = accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
    const periodStart =
      transactions.length > 0
        ? formatStatementDate(transactions[transactions.length - 1].created_at)
        : '—';
    const periodEnd =
      transactions.length > 0 ? formatStatementDate(transactions[0].created_at) : '—';

    const accountRows = accounts
      .map(
        (a) => `
        <tr>
          <td>${escapeHtml(a.account_name)}</td>
          <td>${escapeHtml(accountTypeLabel(a.account_type))}</td>
          <td>**** ${escapeHtml(a.account_number_last4)}</td>
          <td style="text-align:right">${formatCurrency(a.balance)}</td>
        </tr>`
      )
      .join('');

    const txRows = transactions
      .map((tx) => {
        const acct = tx.bank_accounts;
        const acctLabel = acct
          ? `${acct.account_name} (**** ${acct.account_number_last4})`
          : '—';
        const isCredit =
          tx.transaction_type === 'credit' ||
          (tx.type && window.NexusMoney?.isCreditType(tx.type));
        const type = isCredit ? 'Credit' : 'Debit';
        const sign = isCredit ? '+' : '-';
        return `
        <tr>
          <td>${formatStatementDate(tx.created_at)}</td>
          <td>${escapeHtml(tx.description)}</td>
          <td>${escapeHtml(acctLabel)}</td>
          <td>${type}</td>
          <td style="text-align:right">${sign}${formatCurrency(tx.amount)}</td>
          <td style="text-align:right">${tx.balance_after != null ? formatCurrency(tx.balance_after) : '—'}</td>
        </tr>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>NexusBank Statement — ${escapeHtml(userName)}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a2e; margin: 40px; line-height: 1.5; }
    h1 { font-size: 1.5rem; margin: 0 0 4px; }
    .brand { color: #6C5CE7; font-weight: bold; }
    .meta { color: #555; font-size: 0.9rem; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0 28px; font-size: 0.88rem; }
    th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
    th { background: #f4f4f8; }
    .summary { background: #f9f9fc; padding: 16px; border: 1px solid #ddd; margin-bottom: 24px; }
    .total { font-size: 1.25rem; font-weight: bold; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <p class="brand">NexusBank</p>
  <h1>Account Statement</h1>
  <div class="meta">
    <div><strong>${escapeHtml(userName)}</strong></div>
    <div>${escapeHtml(userEmail)}</div>
    <div>Statement period: ${periodStart} — ${periodEnd}</div>
    <div>Generated: ${formatStatementDate(generatedAt)}</div>
  </div>
  <div class="summary">
    <div>Total balance across all accounts</div>
    <div class="total">${formatCurrency(total)}</div>
  </div>
  <h2>Your Accounts</h2>
  <table>
    <thead><tr><th>Account</th><th>Type</th><th>Number</th><th>Balance</th></tr></thead>
    <tbody>${accountRows || '<tr><td colspan="4">No accounts</td></tr>'}</tbody>
  </table>
  <h2>Transaction History</h2>
  <table>
    <thead>
      <tr><th>Date</th><th>Description</th><th>Account</th><th>Type</th><th>Amount</th><th>Balance After</th></tr>
    </thead>
    <tbody>${txRows || '<tr><td colspan="6">No transactions</td></tr>'}</tbody>
  </table>
  <p style="font-size:0.8rem;color:#666;margin-top:32px;">
    This statement is for your records. For questions, contact NexusBank support.
  </p>
</body>
</html>`;
  }

  function downloadStatementDocument(html, filename) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadBankStatement(user, profile) {
    const accounts = await fetchAccounts();
    const transactions = await fetchAllTransactions();
    const userName = profile?.full_name || user.user_metadata?.full_name || 'Account Holder';
    const userEmail = profile?.email || user.email || '';
    const html = buildStatementHtml({
      userName,
      userEmail,
      accounts,
      transactions,
      generatedAt: new Date().toISOString(),
    });
    const safeName = userName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'statement';
    const datePart = new Date().toISOString().slice(0, 10);
    downloadStatementDocument(html, `NexusBank-Statement-${safeName}-${datePart}.html`);
  }

  function bindStatementButtons(user, profile) {
    const handler = async (e) => {
      e.preventDefault();
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await downloadBankStatement(user, profile);
      } catch (err) {
        alert('Could not generate statement: ' + (err.message || 'Unknown error'));
      } finally {
        btn.disabled = false;
      }
    };

    document.querySelectorAll('.js-download-statement, .js-view-statement').forEach((el) => {
      el.addEventListener('click', handler);
    });
  }

  function showStatementModal(transactions, accounts) {
    let modal = document.getElementById('statementModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'statementModal';
      modal.className = 'statement-modal';
      modal.innerHTML = `
        <div class="statement-modal-backdrop"></div>
        <div class="statement-modal-panel" role="dialog" aria-labelledby="statementModalTitle">
          <div class="statement-modal-header">
            <h2 id="statementModalTitle">Bank Statement Preview</h2>
            <button type="button" class="statement-modal-close" aria-label="Close">&times;</button>
          </div>
          <div class="statement-modal-body" id="statementModalBody"></div>
          <div class="statement-modal-footer">
            <button type="button" class="btn-secondary js-download-statement">Download Statement</button>
            <button type="button" class="btn-primary statement-modal-close-btn">Close</button>
          </div>
        </div>`;
      document.body.appendChild(modal);

      modal.querySelector('.statement-modal-backdrop').addEventListener('click', () => modal.classList.remove('active'));
      modal.querySelectorAll('.statement-modal-close, .statement-modal-close-btn').forEach((btn) => {
        btn.addEventListener('click', () => modal.classList.remove('active'));
      });
    }

    const body = modal.querySelector('#statementModalBody');
    const total = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
    const previewTx = transactions.slice(0, 20);

    body.innerHTML = `
      <p class="statement-preview-total">Total balance: <strong>${formatCurrency(total)}</strong></p>
      <p class="statement-preview-meta">${previewTx.length} of ${transactions.length} transactions shown</p>
      <div class="statement-preview-list">
        ${previewTx.map((tx) => renderTransactionItem(tx)).join('') || '<p>No transactions yet.</p>'}
      </div>`;

    modal.classList.add('active');
  }

  async function refreshAccountsUI(user, profile) {
    const [accounts, transactions] = await Promise.all([
      fetchAccounts(),
      fetchRecentTransactions(10),
    ]);

    const total = accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);

    const balanceEl = document.getElementById('totalBalanceAmount');
    if (balanceEl) balanceEl.textContent = formatCurrency(total);

    const changeEl = document.getElementById('totalBalanceChange');
    if (changeEl) {
      const credits = transactions
        .filter((t) =>
          t.transaction_type === 'credit' ||
          (t.type && window.NexusMoney?.isCreditType(t.type))
        )
        .reduce((s, t) => s + Number(t.amount), 0);
      changeEl.innerHTML =
        credits > 0
          ? `<i class="fas fa-arrow-up"></i> ${formatCurrency(credits)} recent credits`
          : `<i class="fas fa-wallet"></i> Welcome to NexusBank`;
    }

    const grid = document.getElementById('accountsGrid');
    if (grid) {
      grid.innerHTML =
        accounts.length > 0
          ? accounts.map(renderAccountCard).join('')
          : '<p class="empty-accounts">No accounts found.</p>';
    }

    const txList = document.getElementById('recentTransactionsList');
    if (txList) {
      txList.innerHTML =
        transactions.length > 0
          ? transactions.map(renderTransactionItem).join('')
          : '<p class="empty-transactions">No transactions yet.</p>';
    }

    bindStatementButtons(user, profile);
    return accounts;
  }

  async function loadAccountsPage(user, profile) {
    await ensureBanking();
    const accounts = await refreshAccountsUI(user, profile);

    document.querySelectorAll('.js-open-statement-modal').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const allTx = await fetchAllTransactions();
        showStatementModal(allTx, accounts);
        bindStatementButtons(user, profile);
      });
    });

    document.querySelectorAll('.js-deposit-funds').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const accts = await fetchAccounts();
        window.NexusMoney?.openDepositModal(accts, () => refreshAccountsUI(user, profile));
      });
    });

    document.querySelectorAll('.js-withdraw-funds').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const accts = await fetchAccounts();
        window.NexusMoney?.openWithdrawModal(accts, () => refreshAccountsUI(user, profile));
      });
    });

    if (window.NexusMoney?.subscribeMoneyUpdates) {
      window.NexusMoney.subscribeMoneyUpdates(user.id, () => {
        refreshAccountsUI(user, profile);
      });
    }
  }

  const SAVINGS_GOALS_KEY = 'nexusbank_savings_goals';

  function getSavingsGoals() {
    try {
      return JSON.parse(localStorage.getItem(SAVINGS_GOALS_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function setSavingsGoal(accountId, targetAmount) {
    const goals = getSavingsGoals();
    if (!targetAmount || targetAmount <= 0) {
      delete goals[accountId];
    } else {
      goals[accountId] = targetAmount;
    }
    localStorage.setItem(SAVINGS_GOALS_KEY, JSON.stringify(goals));
  }

  async function fetchSavingsAccounts() {
    const accounts = await fetchAccounts();
    return accounts.filter((a) => a.account_type === 'savings');
  }

  async function fetchSavingsTransactions(limit = 10) {
    const savingsAccounts = await fetchSavingsAccounts();
    const ids = savingsAccounts.map((a) => a.id);
    if (!ids.length) return [];

    const client = getClient();
    let q = client
      .from('transactions')
      .select('*, bank_accounts(account_name, account_type, account_number_last4)')
      .in('account_id', ids)
      .order('created_at', { ascending: false });
    if (limit) q = q.limit(limit);

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function fetchAllSavingsTransactions() {
    return fetchSavingsTransactions(null);
  }

  function calcWeightedApy(accounts) {
    const total = accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
    if (total <= 0) return 0;
    const weighted = accounts.reduce(
      (sum, a) => sum + Number(a.balance || 0) * (Number(a.apy) || 0),
      0
    );
    return weighted / total;
  }

  function calcProjectedYearlyInterest(accounts) {
    return accounts.reduce((sum, a) => {
      const balance = Number(a.balance) || 0;
      const apy = Number(a.apy) || 0;
      return sum + balance * (apy / 100);
    }, 0);
  }

  function renderSavingsAccountCard(account, goals) {
    const balance = Number(account.balance) || 0;
    const apy = Number(account.apy);
    const goalTarget = goals[account.id];
    const hasGoal = goalTarget && goalTarget > 0;
    const progressPct = hasGoal ? Math.min(100, (balance / goalTarget) * 100) : 0;

    const apyLine =
      apy > 0
        ? `<div class="account-change positive">
            <i class="fas fa-percentage" style="font-size:0.65rem"></i>
            ${apy.toFixed(2)}% APY · ~${formatCurrency(balance * (apy / 100))}/yr est.
          </div>`
        : `<div class="account-change positive">
            <i class="fas fa-piggy-bank" style="font-size:0.65rem"></i>
            Savings account
          </div>`;

    const progressBlock = hasGoal
      ? `<div class="savings-progress">
          <div class="progress-header">
            <span>Goal progress</span>
            <span>${Math.round(progressPct)}% of ${formatCurrency(goalTarget)}</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width:${progressPct.toFixed(1)}%"></div>
          </div>
        </div>`
      : '';

    const badgeClass = hasGoal ? 'goal' : 'savings';
    const badgeLabel = hasGoal ? 'Savings Goal' : 'Savings';

    return `
      <div class="account-card" data-account-id="${account.id}">
        <div class="account-card-header">
          <span class="account-type-badge ${badgeClass}">
            <i class="fas fa-circle" style="font-size:0.45rem"></i> ${badgeLabel}
          </span>
          <button type="button" class="account-more-btn js-edit-savings-goal" data-account-id="${account.id}" aria-label="Edit savings goal">
            <i class="fas fa-bullseye"></i>
          </button>
        </div>
        <div class="account-name">${escapeHtml(account.account_name)}</div>
        <div class="account-number">**** ${escapeHtml(account.account_number_last4)}</div>
        <div class="account-balance">${formatCurrency(balance)}</div>
        ${progressBlock}
        ${apyLine}
        <div class="account-actions">
          <a href="transfer.html" class="btn-sm btn-sm-primary">
            <i class="fas fa-exchange-alt"></i> Transfer
          </a>
          <button type="button" class="btn-sm btn-sm-ghost js-deposit-to-account" data-account-id="${account.id}">
            <i class="fas fa-arrow-down"></i> Add
          </button>
        </div>
      </div>`;
  }

  function openSavingsGoalModal(accounts, preselectedId, onSaved) {
    window.NexusMoney?.injectToastStyles?.();

    let modal = document.getElementById('savingsGoalModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'savingsGoalModal';
      modal.className = 'money-modal';
      document.body.appendChild(modal);
    }

    const goals = getSavingsGoals();
    const defaultId = preselectedId || accounts[0]?.id || '';
    const defaultTarget = defaultId ? goals[defaultId] || '' : '';

    const accountOptions = accounts
      .map(
        (a) =>
          `<option value="${a.id}"${a.id === defaultId ? ' selected' : ''}>${escapeHtml(a.account_name)} (${formatCurrency(a.balance)})</option>`
      )
      .join('');

    modal.innerHTML = `
      <div class="money-modal-backdrop"></div>
      <div class="money-modal-panel" role="dialog">
        <button type="button" class="money-modal-close" aria-label="Close">&times;</button>
        <h2>Set Savings Goal</h2>
        <p>Choose a savings account and target amount to track your progress.</p>
        <form id="savingsGoalForm">
          <div class="form-group">
            <label for="goalAccount">Savings account</label>
            <select id="goalAccount" required>${accountOptions}</select>
          </div>
          <div class="form-group">
            <label for="goalTarget">Target amount (USD)</label>
            <input type="number" id="goalTarget" min="1" step="0.01" placeholder="e.g. 25000" value="${defaultTarget}" required />
          </div>
          <div class="money-modal-actions">
            <button type="button" class="btn-secondary money-modal-cancel">Cancel</button>
            <button type="submit" class="btn-primary">Save Goal</button>
          </div>
        </form>
      </div>`;

    modal.classList.add('active');

    const close = () => modal.classList.remove('active');
    modal.querySelector('.money-modal-backdrop').addEventListener('click', close);
    modal.querySelector('.money-modal-close').addEventListener('click', close);
    modal.querySelector('.money-modal-cancel').addEventListener('click', close);

    const accountSelect = modal.querySelector('#goalAccount');
    const targetInput = modal.querySelector('#goalTarget');
    accountSelect.addEventListener('change', () => {
      const id = accountSelect.value;
      targetInput.value = goals[id] || '';
    });

    modal.querySelector('#savingsGoalForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const accountId = accountSelect.value;
      const target = parseFloat(targetInput.value);
      if (!target || target <= 0) {
        window.NexusMoney?.showToast?.('Enter a valid target amount', 'error');
        return;
      }
      setSavingsGoal(accountId, target);
      window.NexusMoney?.showToast?.('Savings goal saved', 'success');
      close();
      onSaved?.();
    });
  }

  function showSavingsStatementModal(transactions, accounts, user, profile) {
    const modal = document.getElementById('statementModal');
    if (!modal) {
      showStatementModal(transactions, accounts);
      bindStatementButtons(user, profile);
      return;
    }

    const total = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
    const totalEl = document.getElementById('statementTotal');
    if (totalEl) totalEl.textContent = formatCurrency(total);

    const metaEl = modal.querySelector('.statement-preview-meta');
    if (metaEl) {
      metaEl.textContent = `${transactions.length} savings transaction${transactions.length === 1 ? '' : 's'} · current month`;
    }

    const listEl = document.getElementById('statementPreviewList');
    if (listEl) {
      listEl.innerHTML =
        transactions.length > 0
          ? transactions.slice(0, 20).map((tx) => renderTransactionItem(tx)).join('')
          : '<p class="empty-transactions">No savings activity yet.</p>';
    }

    modal.classList.add('active');
  }

  async function downloadSavingsStatement(user, profile) {
    const accounts = await fetchSavingsAccounts();
    const transactions = await fetchAllSavingsTransactions();
    const userName = profile?.full_name || user.user_metadata?.full_name || 'Account Holder';
    const userEmail = profile?.email || user.email || '';
    const html = buildStatementHtml({
      userName,
      userEmail,
      accounts,
      transactions,
      generatedAt: new Date().toISOString(),
    });
    const safeName = userName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'savings-statement';
    const datePart = new Date().toISOString().slice(0, 10);
    downloadStatementDocument(html, `NexusBank-Savings-${safeName}-${datePart}.html`);
  }

  async function refreshSavingsUI(user, profile) {
    const [accounts, transactions] = await Promise.all([
      fetchSavingsAccounts(),
      fetchSavingsTransactions(10),
    ]);
    const goals = getSavingsGoals();
    const total = accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
    const weightedApy = calcWeightedApy(accounts);
    const yearlyInterest = calcProjectedYearlyInterest(accounts);

    const balanceEl = document.getElementById('totalSavingsBalance');
    if (balanceEl) balanceEl.textContent = formatCurrency(total);

    const changeEl = document.getElementById('totalSavingsChange');
    if (changeEl) {
      if (accounts.length === 0) {
        changeEl.innerHTML = '<i class="fas fa-piggy-bank"></i> No savings accounts yet';
      } else if (weightedApy > 0) {
        changeEl.innerHTML = `<i class="fas fa-chart-line"></i> ${weightedApy.toFixed(2)}% blended APY · ~${formatCurrency(yearlyInterest)}/yr est.`;
      } else {
        changeEl.innerHTML = `<i class="fas fa-wallet"></i> ${accounts.length} savings account${accounts.length === 1 ? '' : 's'}`;
      }
    }

    const statsEl = document.getElementById('savingsStatsRow');
    if (statsEl) {
      const goalCount = accounts.filter((a) => goals[a.id] > 0).length;
      statsEl.innerHTML = `
        <div class="savings-stat-card">
          <div class="savings-stat-label">Accounts</div>
          <div class="savings-stat-value">${accounts.length}</div>
        </div>
        <div class="savings-stat-card">
          <div class="savings-stat-label">Blended APY</div>
          <div class="savings-stat-value">${weightedApy > 0 ? weightedApy.toFixed(2) + '%' : '—'}</div>
        </div>
        <div class="savings-stat-card">
          <div class="savings-stat-label">Est. yearly interest</div>
          <div class="savings-stat-value">${formatCurrency(yearlyInterest)}</div>
        </div>
        <div class="savings-stat-card">
          <div class="savings-stat-label">Active goals</div>
          <div class="savings-stat-value">${goalCount}</div>
        </div>`;
    }

    const grid = document.getElementById('savingsGrid');
    if (grid) {
      grid.innerHTML =
        accounts.length > 0
          ? accounts.map((a) => renderSavingsAccountCard(a, goals)).join('')
          : '<p class="empty-accounts">No savings accounts found. Run the banking setup SQL in Supabase, then refresh.</p>';
    }

    const txList = document.getElementById('recentSavingsTransactions');
    if (txList) {
      txList.innerHTML =
        transactions.length > 0
          ? transactions.map((tx) => renderTransactionItem(tx)).join('')
          : '<p class="empty-transactions">No savings activity yet.</p>';
    }

    document.querySelectorAll('.js-edit-savings-goal').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openSavingsGoalModal(accounts, btn.dataset.accountId, () => refreshSavingsUI(user, profile));
      });
    });

    document.querySelectorAll('.js-deposit-to-account').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = btn.dataset.accountId;
        window.NexusMoney?.openDepositModal(accounts, () => refreshSavingsUI(user, profile));
        requestAnimationFrame(() => {
          const select = document.querySelector('#moneyAccount');
          if (select && accountId) select.value = accountId;
        });
      });
    });

    return accounts;
  }

  async function loadSavingsPage(user, profile) {
    await ensureBanking();
    const accounts = await refreshSavingsUI(user, profile);

    document.querySelectorAll('.js-open-statement-modal').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const allTx = await fetchAllSavingsTransactions();
        showSavingsStatementModal(allTx, accounts, user, profile);
      });
    });

    const downloadBtn = document.getElementById('downloadStatementBtn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (downloadBtn.disabled) return;
        downloadBtn.disabled = true;
        try {
          await downloadSavingsStatement(user, profile);
        } catch (err) {
          alert('Could not generate statement: ' + (err.message || 'Unknown error'));
        } finally {
          downloadBtn.disabled = false;
        }
      });
    }

    const closeStatement = () => {
      const modal = document.getElementById('statementModal');
      if (modal) modal.classList.remove('active');
    };
    document.getElementById('closeStatementModal')?.addEventListener('click', closeStatement);
    document.getElementById('cancelStatementBtn')?.addEventListener('click', closeStatement);
    document.querySelector('#statementModal .statement-modal-backdrop')?.addEventListener('click', closeStatement);

    document.querySelectorAll('.js-deposit-savings').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const accts = await fetchSavingsAccounts();
        if (!accts.length) {
          window.NexusMoney?.showToast?.('No savings accounts available', 'error');
          return;
        }
        window.NexusMoney?.openDepositModal(accts, () => refreshSavingsUI(user, profile));
      });
    });

    document.querySelectorAll('.js-withdraw-savings').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const accts = await fetchSavingsAccounts();
        if (!accts.length) {
          window.NexusMoney?.showToast?.('No savings accounts available', 'error');
          return;
        }
        window.NexusMoney?.openWithdrawModal(accts, () => refreshSavingsUI(user, profile));
      });
    });

    document.querySelectorAll('.js-create-savings-goal').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const accts = await fetchSavingsAccounts();
        if (!accts.length) {
          window.NexusMoney?.showToast?.('Create a savings account first', 'error');
          return;
        }
        openSavingsGoalModal(accts, null, () => refreshSavingsUI(user, profile));
      });
    });

    if (window.NexusMoney?.subscribeMoneyUpdates) {
      window.NexusMoney.subscribeMoneyUpdates(user.id, () => {
        refreshSavingsUI(user, profile);
      });
    }
  }

  window.NexusBanking = {
    ensureBanking,
    fetchAccounts,
    fetchSavingsAccounts,
    fetchRecentTransactions,
    fetchAllTransactions,
    fetchSavingsTransactions,
    formatCurrency,
    loadAccountsPage,
    loadSavingsPage,
    downloadBankStatement,
    downloadSavingsStatement,
  };
})();
