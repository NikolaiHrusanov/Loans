# Banking database setup

Run **`supabase/banking-schema.sql`** once in the Supabase SQL Editor before testing accounts or registration.

## What it creates

| Table | Purpose |
|-------|---------|
| `bank_accounts` | Per-user accounts (checking, savings, investment), balances, last 4 digits |
| `bank_transactions` | Transaction history linked to accounts and users |

## New user welcome balance

When a row is inserted into `profiles` (registration), a trigger creates three accounts totaling **$20,000**:

- Everyday Checking — $5,000  
- Standard Savings — $12,000  
- Basic Savings — $3,000  

Each account gets a “Welcome Bonus — Account Opening” credit transaction.

The app also calls `ensure_user_banking()` after registration and on the accounts page so existing users without banking data are backfilled safely.

## Security

Row Level Security is enabled. Authenticated users can **read only their own** rows (`auth.uid() = user_id`). Account creation runs through `SECURITY DEFINER` functions, not direct client inserts.

## Bank statements

On **accounts.html**, use **View Statements** or the **Statements** quick action to preview recent activity and **Download Statement** to save an HTML document to your PC (open in a browser or print to PDF).
