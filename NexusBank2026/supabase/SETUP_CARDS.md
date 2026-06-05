# NexusBank — Card system setup

Run in **Supabase Dashboard → SQL Editor** (in order):

1. `supabase/banking-schema.sql`
2. `supabase/money-management.sql`
3. `supabase/profiles-registration-rls.sql` (if profile insert fails)
4. **`supabase/cards-migration-complete.sql`** ← **run this for Add Existing Card + virtual cards**

> Older split migrations (`cards-schema.sql` + `cards-schema-v2.sql`) are still valid if you already ran them.  
> If cards are not saving or not appearing, run **`cards-migration-complete.sql`** — it is idempotent and safe to re-run.

## Realtime (optional)

In **Database → Replication**, add to `supabase_realtime`:

- `cards`
- `card_transactions`
- `card_settings`

## How Add Existing Card works

1. User must be signed in via **Supabase Auth** (JWT session). Local-only demo sessions cannot save cards.
2. Frontend validates card number (Luhn), expiry (MM/YY), and CVV before calling the RPC.
3. `add_external_card_secure` RPC:
   - Verifies `auth.uid()` matches the authenticated user
   - Encrypts the full PAN with `pgp_sym_encrypt` (per-user key)
   - Stores only `last_four_digits` + metadata in `public.cards`
   - **Never stores CVV**
   - Creates a `card_settings` row
4. The app reads cards from `cards_safe` (view that hides `encrypted_card_number`).

## Test card numbers (exactly 16 digits, Luhn-valid)

| Network | Number |
|---------|--------|
| Visa | `4532015112830366` |
| Mastercard | `5425233430109903` |

Use any future expiry (e.g. `12/30`) and CVV `123`.

If you already ran the migration, apply **`cards-fix-16-digits.sql`** to update server validation to 16 digits.

## Security (important)

- Full card numbers are encrypted in Postgres inside SECURITY DEFINER RPCs.
- The app only reads from `cards_safe`, which never exposes encrypted data.
- CVV is validated when adding a card and is **never stored** (PCI best practice).
- For production, use a payment processor (Stripe Issuing, etc.) and Supabase Vault for keys.

## Card programs

| Program | `partner_type` |
|---------|----------------|
| NexusBank Standard | `standard` |
| NexusBank × Flexi | `flexi` |
| NexusBank × Blaze Wear | `blaze_wear` |
| External debit/credit | `none` |
