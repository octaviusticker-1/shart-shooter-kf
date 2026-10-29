document.addEventListener('DOMContentLoaded', () => {
  const client = window.shartSupabaseClient;
  const loginForm = document.getElementById('adminLoginForm');
  if (!loginForm) {
    return;
  }

  const dashboard = document.getElementById('adminDashboard');
  const configMessage = document.getElementById('adminConfigMessage');
  const loginStatus = document.getElementById('adminLoginStatus');
  const adminStatus = document.getElementById('adminStatus');
  const loginButton = loginForm.querySelector('button[type="submit"]');
  const bucketName = 'team-gallery';

  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle('error', isError);
  }

  function formValue(form, name) {
    return new FormData(form).get(name)?.toString().trim() || '';
  }

  function field(form, name) {
    return form.elements.namedItem(name);
  }

  function resetForm(form) {
    form.reset();
    field(form, 'id').value = '';
  }

  function createAdminRow(titleText, detailText, editAction, deleteAction) {
    const row = document.createElement('article');
    row.className = 'admin-record-row';
    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = titleText;
    const detail = document.createElement('span');
    detail.textContent = detailText;
    content.append(title, detail);

    const actions = document.createElement('div');
    actions.className = 'admin-row-actions';
    if (editAction) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'admin-text-button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', editAction);
      actions.append(edit);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'admin-text-button danger';
    remove.textContent = 'Delete';
    remove.addEventListener('click', deleteAction);
    actions.append(remove);
    row.append(content, actions);
    return row;
  }

  async function requireAdmin(user) {
    const { data, error } = await client
      .from('site_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      throw new Error(`Could not verify admin permissions: ${error.message}`);
    }
    if (!data) {
      await client.auth.signOut();
      throw new Error('This account is not authorized as a team admin.');
    }
  }

  async function loadPhotos() {
    const list = document.getElementById('adminPhotoList');
    const { data, error } = await client
      .from('gallery_photos')
      .select('id, storage_path, caption, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      throw new Error(`Could not load photos: ${error.message}`);
    }

    list.replaceChildren();
    for (const photo of data) {
      const removePhoto = async (button) => {
        button.disabled = true;
        const { error: storageError } = await client.storage.from(bucketName).remove([photo.storage_path]);
        if (storageError) {
          button.disabled = false;
          setStatus(adminStatus, `Could not delete the photo file: ${storageError.message}`, true);
          return;
        }
        const { error: rowError } = await client.from('gallery_photos').delete().eq('id', photo.id);
        if (rowError) {
          button.disabled = false;
          setStatus(adminStatus, `Photo file deleted, but its record could not be removed: ${rowError.message}`, true);
          return;
        }
        await refreshDashboard();
        setStatus(adminStatus, 'Photo removed from the public gallery.');
      };

      list.append(createAdminRow(
        photo.caption || 'Untitled photo',
        new Date(photo.created_at).toLocaleString(),
        null,
        (event) => removePhoto(event.currentTarget)
      ));
    }
  }

  async function loadAnnouncements() {
    const list = document.getElementById('adminAnnouncementList');
    const { data, error } = await client
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      throw new Error(`Could not load announcements: ${error.message}`);
    }

    list.replaceChildren();
    const form = document.getElementById('adminAnnouncementForm');
    for (const announcement of data) {
      list.append(createAdminRow(
        announcement.title,
        `${announcement.is_published ? 'Published' : 'Draft'} · ${announcement.body}`,
        () => {
          field(form, 'id').value = announcement.id;
          field(form, 'title').value = announcement.title;
          field(form, 'body').value = announcement.body;
          field(form, 'is_published').checked = announcement.is_published;
          form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          const { error: deleteError } = await client.from('announcements').delete().eq('id', announcement.id);
          if (deleteError) {
            button.disabled = false;
            setStatus(adminStatus, `Could not delete announcement: ${deleteError.message}`, true);
            return;
          }
          resetForm(form);
          await refreshDashboard();
          setStatus(adminStatus, 'Announcement deleted.');
        }
      ));
    }
  }

  async function loadGames() {
    const list = document.getElementById('adminGameList');
    const { data, error } = await client
      .from('games')
      .select('*')
      .order('game_date', { ascending: false });
    if (error) {
      throw new Error(`Could not load games: ${error.message}`);
    }

    list.replaceChildren();
    const form = document.getElementById('adminGameForm');
    for (const game of data) {
      const score = game.status === 'completed'
        ? ` · ${game.home_score}–${game.opponent_score}`
        : ' · Upcoming';
      const detail = `${new Date(game.game_date).toLocaleString()}${game.location ? ` · ${game.location}` : ''}${score}`;
      list.append(createAdminRow(
        `vs. ${game.opponent}`,
        detail,
        () => {
          field(form, 'id').value = game.id;
          field(form, 'opponent').value = game.opponent;
          field(form, 'game_date').value = new Date(game.game_date).toISOString().slice(0, 16);
          field(form, 'location').value = game.location;
          field(form, 'status').value = game.status;
          field(form, 'home_score').value = game.home_score ?? '';
          field(form, 'opponent_score').value = game.opponent_score ?? '';
          field(form, 'notes').value = game.notes;
          form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          const { error: deleteError } = await client.from('games').delete().eq('id', game.id);
          if (deleteError) {
            button.disabled = false;
            setStatus(adminStatus, `Could not delete game: ${deleteError.message}`, true);
            return;
          }
          resetForm(form);
          await refreshDashboard();
          setStatus(adminStatus, 'Game deleted.');
        }
      ));
    }
  }

  async function loadPlayers() {
    const list = document.getElementById('adminPlayerList');
    const { data, error } = await client
      .from('players')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('display_name', { ascending: true });
    if (error) {
      throw new Error(`Could not load roster: ${error.message}`);
    }

    list.replaceChildren();
    const form = document.getElementById('adminPlayerForm');
    for (const player of data) {
      list.append(createAdminRow(
        player.display_name,
        [player.jersey_number && `#${player.jersey_number}`, player.position].filter(Boolean).join(' · ') || 'Team player',
        () => {
          field(form, 'id').value = player.id;
          field(form, 'display_name').value = player.display_name;
          field(form, 'jersey_number').value = player.jersey_number;
          field(form, 'position').value = player.position;
          field(form, 'bio').value = player.bio;
          field(form, 'sort_order').value = player.sort_order;
          form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          const { error: deleteError } = await client.from('players').delete().eq('id', player.id);
          if (deleteError) {
            button.disabled = false;
            setStatus(adminStatus, `Could not delete player: ${deleteError.message}`, true);
            return;
          }
          resetForm(form);
          await refreshDashboard();
          setStatus(adminStatus, 'Player removed from the roster.');
        }
      ));
    }
  }

  async function refreshDashboard() {
    const results = await Promise.allSettled([loadPhotos(), loadAnnouncements(), loadGames(), loadPlayers()]);
    const failures = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason.message);
    if (failures.length) {
      setStatus(adminStatus, failures.join(' '), true);
    }
  }

  function bindContentForm(formId, tableName, getValues, successMessage) {
    const form = document.getElementById(formId);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const saveButton = form.querySelector('button[type="submit"]');
      saveButton.disabled = true;
      try {
        const id = formValue(form, 'id');
        const values = getValues(form);
        const result = id
          ? await client.from(tableName).update(values).eq('id', id)
          : await client.from(tableName).insert(values);
        if (result.error) {
          throw result.error;
        }
        resetForm(form);
        await refreshDashboard();
        setStatus(adminStatus, successMessage);
      } catch (error) {
        setStatus(adminStatus, `Could not save changes: ${error.message}`, true);
      } finally {
        saveButton.disabled = false;
      }
    });
  }

  function bindForms() {
    bindContentForm(
      'adminAnnouncementForm',
      'announcements',
      (form) => ({
        title: formValue(form, 'title'),
        body: formValue(form, 'body'),
        is_published: field(form, 'is_published').checked
      }),
      'Announcement saved.'
    );

    bindContentForm(
      'adminGameForm',
      'games',
      (form) => {
        const status = formValue(form, 'status');
        const homeScore = formValue(form, 'home_score');
        const opponentScore = formValue(form, 'opponent_score');
        if (status === 'completed' && (homeScore === '' || opponentScore === '')) {
          throw new Error('Enter both scores before saving a final result.');
        }
        return {
          opponent: formValue(form, 'opponent'),
          game_date: new Date(field(form, 'game_date').value).toISOString(),
          location: formValue(form, 'location'),
          status,
          home_score: status === 'completed' ? Number(homeScore) : null,
          opponent_score: status === 'completed' ? Number(opponentScore) : null,
          notes: formValue(form, 'notes')
        };
      },
      'Game saved.'
    );

    bindContentForm(
      'adminPlayerForm',
      'players',
      (form) => ({
        display_name: formValue(form, 'display_name'),
        jersey_number: formValue(form, 'jersey_number'),
        position: formValue(form, 'position'),
        bio: formValue(form, 'bio'),
        sort_order: Number(field(form, 'sort_order').value) || 0
      }),
      'Roster player saved.'
    );

    for (const button of document.querySelectorAll('[data-reset-form]')) {
      button.addEventListener('click', () => resetForm(document.getElementById(button.dataset.resetForm)));
    }
  }

  async function uploadPhotos(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const files = Array.from(field(form, 'photos').files || []);
    const caption = formValue(form, 'caption');
    if (!files.length) {
      setStatus(adminStatus, 'Choose at least one photo to upload.', true);
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus(adminStatus, 'Uploading photos…');
    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error(sessionError?.message || 'Your admin session has ended. Please sign in again.');
      }
      const userId = sessionData.session.user.id;

      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
          throw new Error(`${file.name}: choose a JPG, PNG, WEBP, or GIF image.`);
        }
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`${file.name}: photos must be 10 MB or smaller.`);
        }

        const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'team-photo';
        const path = `${userId}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await client.storage.from(bucketName).upload(path, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false
        });
        if (uploadError) {
          throw new Error(`Could not upload ${file.name}: ${uploadError.message}`);
        }

        const { error: insertError } = await client.from('gallery_photos').insert({
          storage_path: path,
          caption
        });
        if (insertError) {
          const { error: cleanupError } = await client.storage.from(bucketName).remove([path]);
          const cleanupMessage = cleanupError ? ` Cleanup also failed: ${cleanupError.message}` : '';
          throw new Error(`Could not publish ${file.name}: ${insertError.message}.${cleanupMessage}`);
        }
      }

      form.reset();
      await refreshDashboard();
      setStatus(adminStatus, `${files.length} ${files.length === 1 ? 'photo' : 'photos'} published to the public gallery.`);
    } catch (error) {
      setStatus(adminStatus, error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function showDashboard(user) {
    await requireAdmin(user);
    loginForm.hidden = true;
    dashboard.hidden = false;
    document.getElementById('adminIdentity').textContent = `Signed in as ${user.email}`;
    setStatus(loginStatus, '');
    await refreshDashboard();
  }

  if (!client) {
    loginForm.hidden = true;
    configMessage.hidden = false;
    const instructions = configMessage.querySelector('p');
    if (window.shartSupabaseError) {
      instructions.textContent = window.shartSupabaseError;
    }
    return;
  }

  bindForms();
  document.getElementById('adminPhotoForm').addEventListener('submit', uploadPhotos);
  document.getElementById('adminSignOut').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    const { error } = await client.auth.signOut();
    event.currentTarget.disabled = false;
    if (error) {
      setStatus(adminStatus, `Could not sign out: ${error.message}`, true);
      return;
    }
    dashboard.hidden = true;
    loginForm.hidden = false;
    loginForm.reset();
    setStatus(loginStatus, 'You have signed out.');
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginButton.disabled = true;
    setStatus(loginStatus, 'Signing in…');
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: formValue(loginForm, 'email'),
        password: field(loginForm, 'password').value
      });
      if (error) {
        throw error;
      }
      await showDashboard(data.user);
    } catch (error) {
      dashboard.hidden = true;
      loginForm.hidden = false;
      setStatus(loginStatus, error.message || 'Sign in failed. Check your credentials and try again.', true);
    } finally {
      loginButton.disabled = false;
    }
  });

  client.auth.getSession().then(({ data, error }) => {
    if (error) {
      setStatus(loginStatus, `Could not check the saved session: ${error.message}`, true);
      return;
    }
    if (data.session) {
      showDashboard(data.session.user).catch((adminError) => {
        setStatus(loginStatus, adminError.message, true);
      });
    }
  });
});
