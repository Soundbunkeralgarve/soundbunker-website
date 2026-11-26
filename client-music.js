(() => {
  let currentFolder = '';
  let listRequest = 0;
  let playRequest = 0;
  let currentTrack = null;
  let owner = null;
  let unlocked = false;
  document.addEventListener('DOMContentLoaded', () => {
    const card = document.querySelector('#musicFolderLink')?.closest('article');
    if (!card) return;
    const section = document.createElement('div');
    section.className = 'portal-music';
    section.innerHTML = '<h4>Listen & download</h4><div class="portal-music-nav"><button type="button" data-up hidden>Back</button><button type="button" data-refresh>Refresh tracks</button></div><p data-folder></p><p data-status role="status" aria-live="polite"></p><div data-tracks></div><p data-playing></p><audio controls preload="none" aria-label="Your music player" hidden></audio><button type="button" data-retry hidden>Reload selected track</button>';
    card.append(section);
    const el = selector => section.querySelector(selector);
    const player = el('audio');
    const status = el('[data-status]');
    async function api(query) {
      try {
        const result = await portalApi('/api/client-music?' + new URLSearchParams(query));
        if (result.access) renderDeliveryAccess(result.access);
        return result;
      } catch (error) {
        if (error.data?.access) renderDeliveryAccess(error.data.access);
        if (error.status === 402) lock(error.data?.access);
        throw error;
      }
    }
    function stop() {
      playRequest++;
      player.pause(); player.removeAttribute('src'); player.load(); player.hidden = true;
      currentTrack = null;
      el('[data-playing]').textContent = '';
      el('[data-retry]').hidden = true;
    }
    function reset() {
      listRequest++;
      stop(); currentFolder = '';
      el('[data-tracks]').replaceChildren();
    }
    function lock(access) {
      unlocked = false;
      reset();
      status.textContent = access?.requiresReview
        ? (access.message || 'Please contact the studio to check your balance.')
        : Number(access?.balanceCents) > 0
          ? 'Pay your remaining balance above to unlock listening and downloads.'
          : 'Check your download access above to continue.';
    }
    function safeFileUrl(value) {
      const url = new URL(value);
      if (url.protocol !== 'https:') throw new Error('This download could not be opened. Please refresh your files.');
      return url.href;
    }
    async function browse(path = currentFolder) {
      const request = ++listRequest;
      status.textContent = 'Loading tracks…';
      try {
        const data = await api({ path });
        if (request !== listRequest) return;
        currentFolder = path;
        el('[data-folder]').textContent = path || 'My Music';
        el('[data-up]').hidden = !path;
        el('[data-tracks]').replaceChildren();
        for (const entry of data.entries || []) {
          const row = document.createElement('div'); row.className = 'portal-music-track';
          if (entry.type === 'folder') {
            const button = document.createElement('button'); button.type = 'button';
            button.className = 'portal-music-folder'; button.textContent = entry.name;
            button.addEventListener('click', () => browse(entry.path)); row.append(button);
          } else {
            const name = document.createElement('span'); name.textContent = entry.name;
            const actions = document.createElement('div'); actions.className = 'portal-music-track-actions';
            const listen = document.createElement('button'); listen.type = 'button'; listen.textContent = 'Listen';
            listen.setAttribute('aria-label', 'Listen to ' + entry.name);
            listen.addEventListener('click', () => play(entry));
            const download = document.createElement('button'); download.type = 'button'; download.textContent = 'Download';
            download.setAttribute('aria-label', 'Download ' + entry.name);
            download.addEventListener('click', () => downloadTrack(entry, download));
            if (entry.playable === true || (entry.playable === undefined && /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aif|aiff|mp4|webm)$/i.test(entry.name))) actions.append(listen);
            actions.append(download); row.append(name, actions);
          }
          el('[data-tracks]').append(row);
        }
        status.textContent = data.entries?.length ? 'Choose a track to listen or download.' : 'No tracks in this folder yet.';
      } catch (error) {
        if (request === listRequest || error.status === 402) status.textContent = error.status === 402
          ? (error.data?.access?.requiresReview ? error.data.access.message : 'Pay your remaining balance above to unlock listening and downloads.') : error.message;
      }
    }
    async function downloadTrack(track, button) {
      button.disabled = true;
      status.textContent = 'Preparing your download…';
      try {
        const data = await api({ action: 'download', path: track.path });
        const link = document.createElement('a');
        link.href = safeFileUrl(data.url); link.download = track.name; link.rel = 'noopener';
        document.body.append(link); link.click(); link.remove();
        status.textContent = 'Your download is ready.';
      } catch (error) { status.textContent = error.message; }
      finally { button.disabled = false; }
    }
    async function play(track) {
      stop();
      const request = ++playRequest;
      currentTrack = track;
      el('[data-playing]').textContent = track.name;
      status.textContent = 'Loading your track…';
      try {
        const data = await api({ action: 'play', path: track.path });
        if (request !== playRequest) return;
        player.src = safeFileUrl(data.url); player.hidden = false;
        status.textContent = '';
        try { await player.play(); } catch (error) {
          if (request !== playRequest) return;
          status.textContent = error.name === 'NotAllowedError' ? 'Tap play below to start listening.' : 'Playback could not start. Reload the track or download it.';
          el('[data-retry]').hidden = error.name === 'NotAllowedError';
        }
      } catch (error) {
        if (request !== playRequest) return;
        status.textContent = error.message; el('[data-retry]').hidden = error.status === 402;
      }
    }
    player.addEventListener('error', () => {
      if (!player.getAttribute('src')) return;
      status.textContent = 'This track could not play. Reload it or choose Download.';
      el('[data-retry]').hidden = false;
    });
    player.addEventListener('play', () => {
      document.querySelectorAll('audio,video').forEach(media => { if (media !== player) media.pause(); });
    });
    document.addEventListener('sb-browse-music', async event => {
      section.scrollIntoView({ block: 'center', behavior: 'smooth' });
      try {
        const root = await api({ path: '' });
        const folder = (root.entries || []).find(entry => entry.type === 'folder' && entry.name === event.detail?.folder);
        browse(folder?.path || '');
      } catch (error) { status.textContent = error.message; }
    });
    document.addEventListener('sb-delivery-access', event => {
      const wasUnlocked = unlocked;
      unlocked = event.detail?.canDownload === true;
      if (!unlocked) lock(event.detail);
      else if (!wasUnlocked && owner) browse('');
    });
    document.addEventListener('sb-music-uploaded', () => browse());
    document.querySelector('#musicFolderLink').addEventListener('click', () => browse(''));
    el('[data-refresh]').addEventListener('click', () => browse());
    el('[data-up]').addEventListener('click', () => browse(currentFolder.split('/').slice(0, -1).join('/')));
    el('[data-retry]').addEventListener('click', () => { if (currentTrack) play(currentTrack); });
    document.querySelector('#refreshDropbox')?.addEventListener('click', () => browse());
    const panel = document.querySelector('#portalPanel');
    function sync() {
      if (panel.hidden) { if (owner !== null) { owner = null; unlocked = false; reset(); } return; }
      const email = document.querySelector('#clientEmail')?.textContent;
      if (email && email !== owner) {
        reset(); owner = email; browse('');
      }
    }
    new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true, characterData: true });
    sync();
  });
})();
