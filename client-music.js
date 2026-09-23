(() => {
  let currentFolder = '';
  let listRequest = 0;
  let playRequest = 0;
  let currentTrack = null;
  let owner = null;
  document.addEventListener('DOMContentLoaded', () => {
    const card = document.querySelector('#musicFolderLink')?.closest('article');
    if (!card) return;
    const section = document.createElement('div');
    section.className = 'portal-music';
    section.innerHTML = '<h4>Listen to your music</h4><div class="portal-music-nav"><button type="button" data-up hidden>← Back</button><button type="button" data-refresh>Refresh tracks</button></div><p data-folder></p><p data-status role="status" aria-live="polite"></p><div data-tracks></div><p data-playing></p><audio controls preload="none" aria-label="Music demo player" hidden></audio><button type="button" data-retry hidden>Reload selected track</button>';
    card.append(section);
    const el = selector => section.querySelector(selector);
    const player = el('audio');
    const status = el('[data-status]');
    async function api(query) {
      return portalApi('/api/client-music?' + new URLSearchParams(query));
    }
    function reset() {
      listRequest++; playRequest++;
      player.pause(); player.removeAttribute('src'); player.load(); player.hidden = true;
      currentTrack = null; currentFolder = '';
      el('[data-tracks]').replaceChildren(); el('[data-playing]').textContent = '';
      el('[data-retry]').hidden = true;
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
        for (const entry of data.entries) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = (entry.type === 'folder' ? '📁 ' : '▶ ') + entry.name;
          button.addEventListener('click', () => entry.type === 'folder' ? browse(entry.path) : play(entry));
          el('[data-tracks]').append(button);
        }
        status.textContent = data.entries.length ? 'Select a track to listen here.' : 'No audio tracks in this folder yet.';
      } catch (error) { if (request === listRequest) status.textContent = error.message; }
    }
    async function play(track) {
      const request = ++playRequest;
      currentTrack = track;
      player.pause(); player.removeAttribute('src'); player.load(); player.hidden = true;
      el('[data-retry]').hidden = true;
      el('[data-playing]').textContent = track.name;
      status.textContent = 'Loading your track…';
      try {
        const data = await api({ action: 'play', path: track.path });
        if (request !== playRequest) return;
        player.src = data.url; player.hidden = false;
        status.textContent = '';
        try { await player.play(); } catch (error) {
          if (request !== playRequest) return;
          status.textContent = error.name === 'NotAllowedError' ? 'Tap play below to start listening.' : 'Playback could not start. Reload the track or use Browse & download.';
          el('[data-retry]').hidden = error.name === 'NotAllowedError';
        }
      } catch (error) {
        if (request !== playRequest) return;
        status.textContent = error.message; el('[data-retry]').hidden = false;
      }
    }
    player.addEventListener('error', () => {
      if (!player.getAttribute('src')) return;
      status.textContent = 'This track could not play. Reload it, or use Browse & download. MP3 is recommended for demos.';
      el('[data-retry]').hidden = false;
    });
    player.addEventListener('play', () => {
      document.querySelectorAll('audio,video').forEach(media => { if (media !== player) media.pause(); });
    });
    el('[data-refresh]').addEventListener('click', () => browse());
    el('[data-up]').addEventListener('click', () => browse(currentFolder.split('/').slice(0,-1).join('/')));
    el('[data-retry]').addEventListener('click', () => { if (currentTrack) play(currentTrack); });
    document.querySelector('#refreshDropbox')?.addEventListener('click', () => browse());
    const panel = document.querySelector('#portalPanel');
    function sync() {
      if (panel.hidden) { if (owner !== null) { owner = null; reset(); } return; }
      const email = document.querySelector('#clientEmail')?.textContent;
      if (email && email !== owner && !document.querySelector('#musicFolderLink').hidden) {
        reset(); owner = email; browse('');
      }
    }
    new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true, characterData: true });
    sync();
  });
})();
