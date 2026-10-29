# Shart Shooter KF admin setup

The admin page uses Supabase Authentication, Postgres with row-level security, and a public-read/private-write photo bucket. Until setup is complete, the admin page and live content will remain disconnected.

## 1. Create the Supabase project

Create a project at [supabase.com](https://supabase.com). Keep its database password private.

## 2. Create the site's tables and security rules

Open the project's **SQL Editor**, paste in `supabase-setup.sql`, and run it. The script creates the content tables, the public photo bucket, and row-level-security policies. Public visitors can read published content and photos; only accounts listed in `site_admins` can change it.

## 3. Create and authorize the admin account

1. In **Authentication → Users**, add the team admin's email and password.
2. Keep public sign-ups disabled. Admin accounts should only be created from the Supabase dashboard.
3. Copy the admin's email and run this query in the SQL Editor, replacing the example address:

   ```sql
   insert into public.site_admins (user_id)
   select id
   from auth.users
   where lower(email) = lower('admin@example.com')
   on conflict (user_id) do nothing;
   ```

Never put an admin password or a Supabase `service_role` secret in this site's files.

## 4. Connect the browser client

In **Project Settings → API**, copy the Project URL and the **publishable** key (or legacy `anon` key). Put them in `supabase-config.js`:

```js
window.SHART_SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT_ID.supabase.co",
  anonKey: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY"
};
```

The publishable/anon key is intended for browser use. The security boundary is the RLS policies from `supabase-setup.sql`, not hiding that key.

## 5. Publish the site

Deploy the HTML, CSS, JavaScript, logo, SQL, and `assets` files to an HTTPS static host. Open `admin.html` on that deployed site and sign in. Set the deployed URL in **Authentication → URL Configuration** as the Site URL/allowed redirect URL.

The admin page manages photos, announcements, upcoming games, scores, and the roster. Public pages read published records from Supabase. Photo objects are publicly viewable; only authorized admins can upload or delete them. The membership-interest form is still a non-submitting preview.

## Local preview

Open the project through a local web server rather than a `file://` URL when testing authentication. The browser's `file://` origin is not a suitable deployed-site origin for Supabase auth redirects.
