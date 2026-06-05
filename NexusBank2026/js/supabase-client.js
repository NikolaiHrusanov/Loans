/**
 * Shared Supabase auth for sign-in.html and protected pages (accounts, etc.)
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://fgcekyagqijztfzzicjw.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnY2VreWFncWlqenRmenppY2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NjA1ODMsImV4cCI6MjA3ODMzNjU4M30.f8PIMx_u7TnXo1cmqAqlnGo71ne6XdY7hQSOjGMX1RE';

  if (!window.supabase) {
    console.error('Supabase JS SDK must load before supabase-client.js');
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const SIGN_IN_PAGE = 'sign-in.html';

  function normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
  }

  function getLoginErrorMessage(error) {
    const msg = (error?.message || '').toLowerCase();
    if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
      return 'Email not confirmed. Finish registration verification, then try again.';
    }
    if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
      return 'Invalid email or password.';
    }
    return error?.message || 'Sign in failed. Please try again.';
  }

  async function confirmEmailIfNeeded(email) {
    const normalized = normalizeEmail(email);
    const rpcs = [
      'confirm_auth_email_after_verification',
      'confirm_auth_email_for_registration',
    ];

    for (const fn of rpcs) {
      const { error } = await client.rpc(fn, { p_email: normalized });
      if (error) console.warn(fn + ':', error.message);
    }
  }

  async function saveLocalSession(user, remember) {
    if (!user) return;

    const { data: profile } = await client
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle();

    const session = {
      id: user.id,
      name: profile?.full_name || user.user_metadata?.full_name || 'User',
      email: profile?.email || user.email,
      loginTime: new Date().toISOString(),
    };

    if (remember) {
      localStorage.setItem('nexusbank_current_user', JSON.stringify(session));
      sessionStorage.removeItem('nexusbank_current_user');
    } else {
      sessionStorage.setItem('nexusbank_current_user', JSON.stringify(session));
      localStorage.removeItem('nexusbank_current_user');
    }

    return session;
  }

  async function signInWithPassword(email, password) {
    const normalized = normalizeEmail(email);
    let result = await client.auth.signInWithPassword({
      email: normalized,
      password,
    });

    if (result.error && /not confirmed/i.test(result.error.message)) {
      await confirmEmailIfNeeded(normalized);
      result = await client.auth.signInWithPassword({
        email: normalized,
        password,
      });
    }

    return result;
  }

  async function ensureProfile(user) {
    const { data: existing } = await client
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!existing) {
      await client.from('profiles').insert([
        {
          id: user.id,
          full_name: user.user_metadata?.full_name || normalizeEmail(user.email).split('@')[0],
          email: normalizeEmail(user.email),
          email_verified: true,
          account_status: 'active',
          kyc_status: 'pending',
        },
      ]);
    }

    const { error: bankingError } = await client.rpc('ensure_user_banking');
    if (bankingError) {
      console.warn('ensure_user_banking:', bankingError.message);
    }
  }

  function applyUserToPage(user, profile) {
    const name =
      profile?.full_name || user.user_metadata?.full_name || user.name || 'User';
    const email = profile?.email || user.email || '';
    const initials = name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    document.querySelectorAll('.user-name').forEach((el) => {
      el.textContent = name;
    });
    document.querySelectorAll('.user-email').forEach((el) => {
      el.textContent = email;
    });
    document.querySelectorAll('.user-avatar').forEach((el) => {
      el.textContent = initials || 'NB';
    });
  }

  function clearLocalSession() {
    localStorage.removeItem('nexusbank_current_user');
    sessionStorage.removeItem('nexusbank_current_user');
  }

  /** Returns a live Supabase session or null (never a localStorage-only stub). */
  async function getSupabaseSession() {
    const {
      data: { session },
    } = await client.auth.getSession();

    if (session?.user) {
      return session;
    }

    const { data: refreshData, error: refreshError } = await client.auth.refreshSession();
    if (refreshError) {
      console.warn('refreshSession:', refreshError.message);
    }
    if (refreshData?.session?.user) {
      return refreshData.session;
    }

    return null;
  }

  async function requireAuth() {
    const session = await getSupabaseSession();

    if (session?.user) {
      await saveLocalSession(session.user, true);
      return session.user;
    }

    clearLocalSession();
    window.location.href = SIGN_IN_PAGE;
    return null;
  }

  /** Load profile from Supabase and paint sidebar user info on every protected page. */
  async function requireAuthWithProfile() {
    const user = await requireAuth();
    if (!user) return null;

    const { data: profile, error } = await client
      .from('profiles')
      .select('full_name, email, balance')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('profiles:', error.message);
    }

    applyUserToPage(user, profile);
    await saveLocalSession(user, true);

    return { user, profile: profile || null };
  }

  window.NexusAuth = {
    supabase: client,
    POST_LOGIN_PAGE: 'accounts.html',
    SIGN_IN_PAGE,
    getSupabaseSession,
    clearLocalSession,
    normalizeEmail,
    getLoginErrorMessage,
    signInWithPassword,
    saveLocalSession,
    ensureProfile,
    applyUserToPage,
    requireAuth,
    requireAuthWithProfile,
    confirmEmailIfNeeded,
  };
})();
