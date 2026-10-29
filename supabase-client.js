(function () {
  const config = window.SHART_SUPABASE_CONFIG;
  const isConfigured = config
    && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url)
    && config.anonKey
    && !config.anonKey.includes("YOUR_");

  if (!isConfigured) {
    window.shartSupabaseClient = null;
    window.shartSupabaseError = 'Add your Supabase project URL and publishable/anon key to supabase-config.js.';
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    window.shartSupabaseClient = null;
    window.shartSupabaseError = 'The Supabase browser library did not load. Check your internet connection and reload.';
    return;
  }

  window.shartSupabaseClient = window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  window.shartSupabaseError = '';
})();
