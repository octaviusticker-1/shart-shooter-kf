document.addEventListener('DOMContentLoaded', () => {
  const client = window.shartSupabaseClient;
  const onGalleryPage = document.getElementById('uploadedGallery');
  const onRosterPage = document.getElementById('rosterGrid');
  const onRecordPage = document.getElementById('gameResults');
  const onHomePage = document.getElementById('nextGameDetails');

  if (!client) {
    const galleryStatus = document.getElementById('galleryDataStatus');
    if (galleryStatus) {
      galleryStatus.textContent = 'The online gallery is not connected yet. A team admin needs to finish Supabase setup.';
    }
    return;
  }

  function setText(element, value) {
    if (element) {
      element.textContent = value;
    }
  }

  function reportError(label, error) {
    console.error(`${label}:`, error);
    const status = document.getElementById('galleryDataStatus');
    if (status) {
      status.textContent = `${label}: ${error.message || 'Please try again later.'}`;
      status.classList.add('error');
    }
  }

  async function loadHomeContent() {
    const announcement = document.getElementById('homeAnnouncement');
    const title = document.getElementById('homeAnnouncementTitle');
    const body = document.getElementById('homeAnnouncementBody');

    const [gameResult, announcementResult] = await Promise.all([
      client.from('games')
        .select('opponent, game_date, location')
        .eq('status', 'scheduled')
        .gte('game_date', new Date().toISOString())
        .order('game_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
      client.from('announcements')
        .select('title, body')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    if (gameResult.error) {
      reportError('Could not load the next game', gameResult.error);
    } else if (gameResult.data) {
      const game = gameResult.data;
      const date = new Date(game.game_date);
      const when = date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
      setText(document.getElementById('nextGameDetails'), `${when}${game.location ? ` · ${game.location}` : ''}`);
      setText(document.querySelector('.opponent-mark + strong'), game.opponent);
    }

    if (announcementResult.error) {
      reportError('Could not load the team announcement', announcementResult.error);
    } else if (announcementResult.data && announcement && title && body) {
      announcement.hidden = false;
      title.textContent = announcementResult.data.title;
      body.textContent = announcementResult.data.body;
    }
  }

  async function loadRoster() {
    const grid = document.getElementById('rosterGrid');
    const emptyState = document.getElementById('rosterEmptyState');
    const { data, error } = await client
      .from('players')
      .select('id, display_name, jersey_number, position, bio')
      .order('sort_order', { ascending: true })
      .order('display_name', { ascending: true });

    if (error) {
      setText(emptyState, 'Could not load the roster. Please try again later.');
      reportError('Could not load the roster', error);
      return;
    }

    grid.replaceChildren();
    if (!data.length) {
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;
    for (const player of data) {
      const card = document.createElement('article');
      card.className = 'player-card';
      const number = document.createElement('div');
      number.className = 'player-number';
      number.textContent = player.jersey_number || 'KF';
      const details = document.createElement('div');
      const name = document.createElement('h3');
      name.textContent = player.display_name;
      const position = document.createElement('p');
      position.textContent = player.position || 'Team player';
      details.append(name, position);
      if (player.bio) {
        const bio = document.createElement('p');
        bio.textContent = player.bio;
        details.append(bio);
      }
      card.append(number, details);
      grid.append(card);
    }
  }

  function setRecordEmpty(message) {
    const empty = document.getElementById('gameResultsEmpty');
    if (empty) {
      empty.hidden = false;
      empty.textContent = message;
    }
  }

  async function loadResults() {
    const body = document.getElementById('gameResults');
    const { data, error } = await client
      .from('games')
      .select('opponent, game_date, status, home_score, opponent_score, location')
      .order('game_date', { ascending: false });

    if (error) {
      setRecordEmpty('Could not load results. Please try again later.');
      reportError('Could not load game results', error);
      return;
    }

    const completed = data.filter((game) => game.status === 'completed');
    const wins = completed.filter((game) => game.home_score > game.opponent_score).length;
    const losses = completed.filter((game) => game.home_score < game.opponent_score).length;
    const winPercentage = completed.length ? (wins / completed.length).toFixed(3).replace(/^0/, '') : '—';
    const streak = [];
    for (const game of completed) {
      if (game.home_score === game.opponent_score) {
        break;
      }
      const result = game.home_score > game.opponent_score ? 'W' : 'L';
      if (streak.length && streak[0][0] !== result) {
        break;
      }
      streak.push(result);
    }

    setText(document.getElementById('winsCount'), String(wins));
    setText(document.getElementById('lossesCount'), String(losses));
    setText(document.getElementById('winPercentage'), winPercentage);
    setText(document.getElementById('winStreak'), streak.length ? `${streak[0]}${streak.length}` : '—');

    body.replaceChildren();
    if (!completed.length) {
      setRecordEmpty('No final scores posted yet. Check back after opening day.');
      return;
    }

    document.getElementById('gameResultsEmpty').hidden = true;
    for (const game of completed) {
      const row = document.createElement('tr');
      const date = document.createElement('td');
      date.textContent = new Date(game.game_date).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      const opponent = document.createElement('td');
      opponent.textContent = game.opponent;
      const resultCell = document.createElement('td');
      const result = document.createElement('span');
      const isWin = game.home_score > game.opponent_score;
      result.className = `result${isWin ? '' : ' loss'}`;
      result.textContent = isWin ? 'Win' : game.home_score === game.opponent_score ? 'Tie' : 'Loss';
      resultCell.append(result);
      const score = document.createElement('td');
      score.textContent = `${game.home_score}–${game.opponent_score}`;
      row.append(date, opponent, resultCell, score);
      body.append(row);
    }
  }

  async function loadGallery() {
    const grid = document.getElementById('uploadedGallery');
    const status = document.getElementById('galleryDataStatus');
    const count = document.getElementById('galleryPhotoCount');
    const { data: sessionData, error: sessionError } = await client.auth.getSession();

    if (sessionError) {
      reportError('Could not check the team admin session', sessionError);
    } else if (sessionData.session) {
      const { data: admin, error: adminError } = await client
        .from('site_admins')
        .select('user_id')
        .eq('user_id', sessionData.session.user.id)
        .maybeSingle();
      if (adminError) {
        reportError('Could not verify team admin permissions', adminError);
      } else if (admin) {
        const adminLink = document.querySelector('.gallery-upload-panel a[href="admin.html"]');
        if (adminLink) {
          adminLink.textContent = 'Manage gallery photos';
        }
      }
    }

    const { data, error } = await client
      .from('gallery_photos')
      .select('id, storage_path, caption, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      reportError('Could not load gallery photos', error);
      return;
    }

    grid.replaceChildren();
    count.textContent = data.length ? `${data.length} ${data.length === 1 ? 'photo' : 'photos'}` : 'No photos yet';
    if (!data.length) {
      status.textContent = 'No team photos have been published yet.';
      return;
    }

    status.textContent = '';
    for (const photo of data) {
      const card = document.createElement('figure');
      card.className = 'uploaded-photo';
      const image = document.createElement('img');
      image.src = client.storage.from('team-gallery').getPublicUrl(photo.storage_path).data.publicUrl;
      image.alt = photo.caption || 'Shart Shooter KF team photo';
      image.loading = 'lazy';
      const caption = document.createElement('figcaption');
      const text = document.createElement('span');
      text.textContent = photo.caption || new Date(photo.created_at).toLocaleDateString();
      caption.append(text);
      card.append(image, caption);
      grid.append(card);
    }
  }

  const tasks = [];
  if (onHomePage) {
    tasks.push(loadHomeContent());
  }
  if (onRosterPage) {
    tasks.push(loadRoster());
  }
  if (onRecordPage) {
    tasks.push(loadResults());
  }
  if (onGalleryPage) {
    tasks.push(loadGallery());
  }
  Promise.all(tasks).catch((error) => reportError('Could not load team information', error));
});
