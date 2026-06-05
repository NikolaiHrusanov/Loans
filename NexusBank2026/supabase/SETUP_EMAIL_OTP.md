# Fix Supabase email: 6-digit code instead of Magic Link only

Supabase uses **one email template** for both Magic Link and OTP.  
If the template only has a link, users get **"Your Magic Link"** with no code.

## Step 1 — Change the email template (required for 6-digit codes)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **Authentication** → **Email Templates**.
3. Open **Magic Link** (this template is used for `signInWithOtp`).
4. Replace the body with something like:

```html
<h2>NexusBank — verify your email</h2>
<p>Your one-time code is:</p>
<p style="font-size: 28px; font-weight: bold; letter-spacing: 8px;">{{ .Token }}</p>
<p style="font-size: 0.85rem; color: #666;">Enter all 6 digits on the registration screen (step 2 shows 6 boxes for non-Resend emails).</p>
<p>Or click this link to continue:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm email</a></p>
<p>This code expires soon. If you did not sign up, ignore this email.</p>
```

5. Save.

After this, fallback emails will include a **6-digit `{{ .Token }}`** users can type in step 2.

## Step 2 — URL configuration (required for Magic Link to work)

1. **Authentication** → **URL Configuration**
2. **Site URL**: your Live Server root, e.g. `http://127.0.0.1:5500`
3. **Redirect URLs** — add:
   - `http://127.0.0.1:5500/register.html`
   - `http://localhost:5500/register.html`
   - (add the exact URL shown in your browser when using Live Server)

Magic links only work when opened in the **same browser** where registration is open, and **not** with `file://`.

## Step 3 — Optional: send 8-digit codes to every email (Resend)

Resend test sender `onboarding@resend.dev` only delivers to the Resend account owner.

To send NexusBank 8-digit emails to **any** address:

1. Verify a domain at [resend.com/domains](https://resend.com/domains)
2. Update the `email-verification` edge function `from` address to e.g. `NexusBank <noreply@yourdomain.com>`
