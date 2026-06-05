/**
 * NexusBank — deposits, withdrawals, transfers, realtime balance updates.
 */
(function () {
  'use strict';

  let realtimeChannel = null;

  function getClient() {
    return window.NexusAuth?.supabase;
  }

  function formatCurrency(amount) {
    return window.NexusBanking?.formatCurrency(amount) ||
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount) || 0);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function typeLabel(type) {
    const map = {
      deposit: 'Deposit',
      withdrawal: 'Withdrawal',
      transfer_sent: 'Transfer Sent',
      transfer_received: 'Transfer Received',
    };
    return map[type] || type;
  }

  function typeIcon(type) {
    const map = {
      deposit: 'fa-arrow-down',
      withdrawal: 'fa-arrow-up',
      transfer_sent: 'fa-paper-plane',
      transfer_received: 'fa-inbox',
    };
    return map[type] || 'fa-receipt';
  }

  function isCreditType(type) {
    return type === 'deposit' || type === 'transfer_received';
  }

  function showToast(message, type = 'success') {
    let container = document.getElementById('nexusToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'nexusToastContainer';
      container.className = 'nexus-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `nexus-toast nexus-toast-${type}`;
    const icon =
      type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  async function depositFunds(accountId, amount, description) {
    const client = getClient();
    const { data, error } = await client.rpc('deposit_funds', {
      p_account_id: accountId,
      p_amount: amount,
      p_description: description || 'Deposit',
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async function withdrawFunds(accountId, amount, description) {
    const client = getClient();
    const { data, error } = await client.rpc('withdraw_funds', {
      p_account_id: accountId,
      p_amount: amount,
      p_description: description || 'Withdrawal',
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async function transferToUser(fromAccountId, recipientEmail, amount, note) {
    const client = getClient();
    const { data, error } = await client.rpc('transfer_to_user', {
      p_from_account_id: fromAccountId,
      p_recipient_email: recipientEmail.trim().toLowerCase(),
      p_amount: amount,
      p_note: note || null,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async function searchRegisteredUsers(query) {
    const client = getClient();
    const { data, error } = await client.rpc('search_registered_users', { p_query: query.trim() });
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function lookupRegisteredUserByEmail(email) {
    const client = getClient();
    const normalized = (email || '').trim().toLowerCase();
    if (!normalized.includes('@')) {
      return null;
    }

    const { data, error } = await client.rpc('lookup_registered_user_by_email', {
      p_email: normalized,
    });
    if (error) throw new Error(error.message);
    return data?.[0] || null;
  }

  async function fetchMoneyTransactions(limit) {
    const client = getClient();
    let q = client
      .from('transactions')
      .select('*, bank_accounts(account_name, account_type, account_number_last4)')
      .order('created_at', { ascending: false });
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function fetchProfileBalance() {
    const client = getClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return 0;
    const { data } = await client.from('profiles').select('balance').eq('id', user.id).maybeSingle();
    return Number(data?.balance) || 0;
  }

  function formatTxDate(iso) {
    if (window.NexusBanking?.formatTxDate) return window.NexusBanking.formatTxDate(iso);
    return new Date(iso).toLocaleString('en-US');
  }

  function renderMoneyTransactionRow(tx) {
    const credit = isCreditType(tx.type);
    const sign = credit ? '+' : '-';
    const icon = typeIcon(tx.type);
    const party =
      tx.type === 'transfer_sent'
        ? `To: ${tx.counterparty_name || tx.counterparty_email || '—'}`
        : tx.type === 'transfer_received'
          ? `From: ${tx.counterparty_name || tx.counterparty_email || '—'}`
          : typeLabel(tx.type);

    return `
      <div class="tx-item" data-tx-id="${tx.id}">
        <div class="tx-icon ${credit ? 'credit' : 'debit'}">
          <i class="fas ${icon}"></i>
        </div>
        <div class="tx-details">
          <div class="tx-name">${escapeHtml(tx.description)}</div>
          <div class="tx-date">${formatTxDate(tx.created_at)} · ${escapeHtml(party)}</div>
        </div>
        <div class="tx-amount ${credit ? 'credit' : 'debit'}">${sign}${formatCurrency(tx.amount)}</div>
      </div>`;
  }

  function renderTransactionTableRow(tx) {
    const credit = isCreditType(tx.type);
    const sign = credit ? '+' : '-';
    const sender =
      tx.type === 'transfer_sent'
        ? 'You'
        : tx.type === 'transfer_received'
          ? tx.counterparty_name || tx.counterparty_email || '—'
          : '—';
    const receiver =
      tx.type === 'transfer_received'
        ? 'You'
        : tx.type === 'transfer_sent'
          ? tx.counterparty_name || tx.counterparty_email || '—'
          : tx.type === 'deposit'
            ? 'You'
            : 'External';

    return `
      <tr>
        <td>${formatTxDate(tx.created_at)}</td>
        <td><span class="tx-type-badge ${tx.type}">${escapeHtml(typeLabel(tx.type))}</span></td>
        <td>${escapeHtml(tx.description)}</td>
        <td>${escapeHtml(sender)}</td>
        <td>${escapeHtml(receiver)}</td>
        <td class="tx-amt ${credit ? 'credit' : 'debit'}">${sign}${formatCurrency(tx.amount)}</td>
      </tr>`;
  }

  function subscribeMoneyUpdates(userId, onUpdate) {
    const client = getClient();
    if (!client || !userId) return null;

    if (realtimeChannel) {
      client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    realtimeChannel = client
      .channel('money-updates-' + userId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bank_accounts', filter: 'user_id=eq.' + userId },
        () => onUpdate?.('accounts')
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions', filter: 'user_id=eq.' + userId },
        () => onUpdate?.('transactions')
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: 'id=eq.' + userId },
        () => onUpdate?.('profile')
      )
      .subscribe();

    return realtimeChannel;
  }

  function unsubscribeMoneyUpdates() {
    const client = getClient();
    if (realtimeChannel && client) {
      client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  function injectToastStyles() {
    if (document.getElementById('nexusToastStyles')) return;
    const style = document.createElement('style');
    style.id = 'nexusToastStyles';
    style.textContent = `
      .nexus-toast-container { position: fixed; top: 1.25rem; right: 1.25rem; z-index: 9999; display: flex; flex-direction: column; gap: 0.5rem; max-width: 360px; }
      .nexus-toast { display: flex; align-items: center; gap: 0.65rem; padding: 0.85rem 1.1rem; border-radius: 10px; background: #1A1E35; border: 1px solid rgba(255,255,255,0.12); color: #F0F2FF; font-size: 0.88rem; box-shadow: 0 8px 32px rgba(0,0,0,0.45); opacity: 0; transform: translateX(12px); transition: all 0.3s ease; }
      .nexus-toast.show { opacity: 1; transform: translateX(0); }
      .nexus-toast-success { border-color: rgba(0,184,148,0.4); }
      .nexus-toast-success i { color: #00B894; }
      .nexus-toast-error { border-color: rgba(232,67,147,0.4); }
      .nexus-toast-error i { color: #E84393; }
      .nexus-toast-info { border-color: rgba(99,102,241,0.4); }
      .nexus-toast-info i { color: #818cf8; }
      .money-modal { display: none; position: fixed; inset: 0; z-index: 900; align-items: center; justify-content: center; padding: 1rem; }
      .money-modal.active { display: flex; }
      .money-modal-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); }
      .money-modal-panel { position: relative; z-index: 1; width: 100%; max-width: 420px; background: #1A1E35; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 1.5rem; box-shadow: 0 16px 48px rgba(0,0,0,0.5); }
      .money-modal-panel h2 { margin: 0 0 0.35rem; font-size: 1.15rem; }
      .money-modal-panel p { margin: 0 0 1rem; color: #A8AFCB; font-size: 0.85rem; }
      .money-modal-panel .form-group { margin-bottom: 1rem; }
      .money-modal-panel label { display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.35rem; color: #A8AFCB; text-transform: uppercase; letter-spacing: 0.06em; }
      .money-modal-panel input, .money-modal-panel select, .money-modal-panel textarea { width: 100%; padding: 0.65rem 0.85rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); background: #13162A; color: #F0F2FF; font-family: inherit; font-size: 0.9rem; }
      .money-modal-actions { display: flex; gap: 0.65rem; justify-content: flex-end; margin-top: 1.25rem; }
      .money-modal-close { position: absolute; top: 0.85rem; right: 0.85rem; background: none; border: none; color: #6B7499; font-size: 1.25rem; cursor: pointer; }
      .recipient-suggestions { list-style: none; margin: 0; padding: 0; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; }
      .recipient-suggestions li { padding: 0.6rem 0.85rem; cursor: pointer; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.06); }
      .recipient-suggestions li:hover { background: rgba(108,92,231,0.12); }
      .recipient-suggestions li:last-child { border-bottom: none; }
      .tx-type-badge { display: inline-block; padding: 0.2rem 0.55rem; border-radius: 100px; font-size: 0.72rem; font-weight: 600; }
      .tx-type-badge.deposit { background: rgba(0,184,148,0.15); color: #34d399; }
      .tx-type-badge.withdrawal { background: rgba(232,67,147,0.15); color: #f472b6; }
      .tx-type-badge.transfer_sent { background: rgba(99,102,241,0.15); color: #818cf8; }
      .tx-type-badge.transfer_received { background: rgba(0,206,201,0.15); color: #2dd4bf; }
      .tx-amt.credit { color: #00B894; font-weight: 700; }
      .tx-amt.debit { color: #E84393; font-weight: 700; }
    `;
    document.head.appendChild(style);
  }

  function openMoneyModal(kind, accounts, onSuccess) {
    injectToastStyles();
    const isDeposit = kind === 'deposit';
    const title = isDeposit ? 'Deposit Funds' : 'Withdraw Funds';
    const subtitle = isDeposit
      ? 'Add money to one of your accounts instantly.'
      : 'Withdraw money from your account. Insufficient balance transfers are blocked.';

    let modal = document.getElementById('moneyActionModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'moneyActionModal';
      modal.className = 'money-modal';
      document.body.appendChild(modal);
    }

    const accountOptions = accounts
      .map(
        (a) =>
          `<option value="${a.id}">${escapeHtml(a.account_name)} (**** ${a.account_number_last4}) — ${formatCurrency(a.balance)}</option>`
      )
      .join('');

    modal.innerHTML = `
      <div class="money-modal-backdrop"></div>
      <div class="money-modal-panel" role="dialog">
        <button type="button" class="money-modal-close" aria-label="Close">&times;</button>
        <h2>${title}</h2>
        <p>${subtitle}</p>
        <form id="moneyActionForm">
          <div class="form-group">
            <label for="moneyAccount">Account</label>
            <select id="moneyAccount" required>${accountOptions}</select>
          </div>
          <div class="form-group">
            <label for="moneyAmount">Amount (USD)</label>
            <input type="number" id="moneyAmount" min="0.01" step="0.01" placeholder="0.00" required />
          </div>
          <div class="form-group">
            <label for="moneyDescription">Description (optional)</label>
            <input type="text" id="moneyDescription" placeholder="${isDeposit ? 'e.g. Paycheck deposit' : 'e.g. ATM withdrawal'}" />
          </div>
          <div class="money-modal-actions">
            <button type="button" class="btn-secondary money-modal-cancel">Cancel</button>
            <button type="submit" class="btn-primary">${isDeposit ? 'Deposit' : 'Withdraw'}</button>
          </div>
        </form>
      </div>`;

    modal.classList.add('active');

    const close = () => modal.classList.remove('active');
    modal.querySelector('.money-modal-backdrop').addEventListener('click', close);
    modal.querySelector('.money-modal-close').addEventListener('click', close);
    modal.querySelector('.money-modal-cancel').addEventListener('click', close);

    modal.querySelector('#moneyActionForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = modal.querySelector('[type="submit"]');
      submitBtn.disabled = true;
      try {
        const accountId = modal.querySelector('#moneyAccount').value;
        const amount = parseFloat(modal.querySelector('#moneyAmount').value);
        const description = modal.querySelector('#moneyDescription').value.trim();
        if (!amount || amount <= 0) throw new Error('Enter a valid amount');

        const result = isDeposit
          ? await depositFunds(accountId, amount, description)
          : await withdrawFunds(accountId, amount, description);

        showToast(result.message || (isDeposit ? 'Deposit successful' : 'Withdrawal successful'), 'success');
        close();
        onSuccess?.(result);
      } catch (err) {
        showToast(err.message || 'Operation failed', 'error');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  window.NexusMoney = {
    formatCurrency,
    typeLabel,
    typeIcon,
    isCreditType,
    showToast,
    depositFunds,
    withdrawFunds,
    transferToUser,
    searchRegisteredUsers,
    lookupRegisteredUserByEmail,
    fetchMoneyTransactions,
    fetchProfileBalance,
    renderMoneyTransactionRow,
    renderTransactionTableRow,
    subscribeMoneyUpdates,
    unsubscribeMoneyUpdates,
    openDepositModal: (accounts, cb) => openMoneyModal('deposit', accounts, cb),
    openWithdrawModal: (accounts, cb) => openMoneyModal('withdraw', accounts, cb),
    injectToastStyles,
  };
})();
