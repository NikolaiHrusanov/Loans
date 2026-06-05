# Supabase redirect URLs (required for email “Log In” link)

Magic links only work if Supabase knows your Live Server address.

1. Open **Supabase Dashboard** → **Authentication** → **URL Configuration**
2. Set **Site URL** to your Live Server root, for example:
   - `http://127.0.0.1:5500`
3. Under **Redirect URLs**, add **both** (use the port Live Server shows in your browser):
   - `http://127.0.0.1:5500/register.html`
   - `http://localhost:5500/register.html`
4. Save.

After clicking **Log In** in the email, you should return to `register.html` and continue at step 3 with your country still selected.
