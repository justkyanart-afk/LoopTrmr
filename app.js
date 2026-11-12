const statusEl = document.getElementById('status');
const videoEl = document.getElementById('video');
const fileInput = document.getElementById('file-input');
const playBtn = document.getElementById('play-btn');

function setStatus(msg) {
  statusEl.textContent = msg;
}

// Enregistrement du service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// Charger un fichier vidéo
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Vérification de la limite de 3 Go (3 * 1024^3 octets)
  const MAX_SIZE = 3 * 1024 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    setStatus("❌ Erreur : Le clip dépasse la limite de 3 Go.");
    return;
  }

  const url = URL.createObjectURL(file);
  videoEl.src = url;
  videoEl.load();
  
  playBtn.disabled = false;
  setStatus(`Clip chargé (${(file.size / 1024 / 1024).toFixed(1)} Mo)`);
});

// Bouton Play / Pause
playBtn.addEventListener('click', () => {
  if (videoEl.paused) {
    videoEl.play();
    playBtn.textContent = '⏸ Pause';
  } else {
    videoEl.pause();
    playBtn.textContent = '▶️ Play';
  }
});

videoEl.addEventListener('ended', () => {
  playBtn.textContent = '▶️ Play';
});
