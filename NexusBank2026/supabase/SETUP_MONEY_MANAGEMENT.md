# Money management setup

Run these SQL files **in order** in the Supabase SQL Editor:

1. `supabase/banking-schema.sql` — accounts, welcome balance, RLS  
2. `supabase/money-management.sql` — `transactions` table, `profiles.balance`, RPC functions, realtime  

## Features

| Action | RPC function | Security |
|--------|--------------|----------|
| Deposit | `deposit_funds(account_id, amount, description)` | Atomic update + transaction log |
| Withdraw | `withdraw_funds(account_id, amount, description)` | Blocks if balance too low |
| Transfer | `transfer_to_user(from_account_id, recipient_email, amount, note)` | Validates sender balance; credits recipient primary account |

Balances cannot be edited directly on `profiles` — a trigger blocks client-side balance changes. Only `SECURITY DEFINER` RPC functions update balances.

## Tables

- **`profiles`** — user info + `balance` (total across all accounts, synced automatically)  
- **`bank_accounts`** — per-account balances (checking, savings, etc.)  
- **`transactions`** — unified log: `deposit`, `withdrawal`, `transfer_sent`, `transfer_received`  
- **`bank_transactions`** — account-level credit/debit lines (used for statements)  

## Realtime

`bank_accounts`, `transactions`, and `profiles` are added to the `supabase_realtime` publication. The app subscribes on **accounts.html**, **transfer.html**, and **transactions.html** so balances refresh instantly after any change.

## UI

- **accounts.html** — Deposit / Withdraw quick actions, live balance, recent activity  
- **transfer.html** — Send money to another registered user by email  
- **transactions.html** — Full history with date, type, amount, sender, receiver  

## Testing transfers

Register two users with different emails. Sign in as User A, go to **Transfer**, enter User B’s email, choose an account, and send. User B’s balance updates in realtime when they are on the accounts or history page.
