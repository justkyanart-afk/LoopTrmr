const statusEl = document.getElementById('status');
const videoEl = document.getElementById('video');
const fileInput = document.getElementById('file-input');
const playBtn = document.getElementById('play-btn');
const canvas = document.getElementById('timeline-canvas');
const ctx = canvas.getContext('2d');
const timeDisplay = document.getElementById('time-display');

let duration = 0;
let isSeeking = false;

function setStatus(msg) { statusEl.textContent = msg; }

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// --- Gestion du chargement ---
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 3 * 1024 * 1024 * 1024) {
    setStatus("❌ Erreur : Le clip dépasse la limite de 3 Go.");
    return;
  }

  videoEl.src = URL.createObjectURL(file);
  videoEl.load();
  playBtn.disabled = false;
  setStatus(`Clip chargé (${(file.size / 1024 / 1024).toFixed(1)} Mo)`);
});

videoEl.addEventListener('loadedmetadata', () => {
  duration = videoEl.duration;
  resizeCanvas();
  drawTimeline();
  updateTimeDisplay();
});

// --- Gestion de la Timeline (Canvas) ---
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
}

function drawTimeline() {
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  
  ctx.clearRect(0, 0, w, h);
  
  if (!duration) return;

  // Fond de la timeline
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, w, h);

  // Graduations (secondes)
  ctx.fillStyle = '#444';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  
  const step = duration > 60 ? 10 : (duration > 10 ? 5 : 1);
  for (let i = 0; i <= duration; i += step) {
    const x = (i / duration) * w;
    ctx.fillRect(x, 0, 1, 10); // Petit trait en haut
    ctx.fillText(formatTime(i).split('.')[0], x, h - 5); // Texte en bas
  }
}

function drawPlayhead() {
  drawTimeline(); // Redessine le fond
  if (!duration) return;
  
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  const x = (videoEl.currentTime / duration) * w;

  // Ligne de la tête de lecture
  ctx.fillStyle = '#2d6cdf';
  ctx.fillRect(x - 1, 0, 2, h);
  
  // Poignée en haut
  ctx.beginPath();
  ctx.arc(x, 8, 5, 0, Math.PI * 2);
  ctx.fill();
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms}`;
}

function updateTimeDisplay() {
  timeDisplay.textContent = `${formatTime(videoEl.currentTime)} / ${formatTime(duration)}`;
}

// --- Interactions avec la Timeline ---
function seek(e) {
  if (!duration) return;
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
  const ratio = x / rect.width;
  
  videoEl.currentTime = ratio * duration;
  drawPlayhead();
  updateTimeDisplay();
}

canvas.addEventListener('pointerdown', (e) => {
  isSeeking = true;
  seek(e);
});

canvas.addEventListener('pointermove', (e) => {
  if (isSeeking) seek(e);
});

window.addEventListener('pointerup', () => { isSeeking = false; });

// --- Lecture Vidéo ---
function loop() {
  if (!videoEl.paused) {
    drawPlayhead();
    updateTimeDisplay();
    requestAnimationFrame(loop);
  }
}

playBtn.addEventListener('click', () => {
  if (videoEl.paused) {
    videoEl.play();
    playBtn.textContent = '⏸ Pause';
    requestAnimationFrame(loop);
  } else {
    videoEl.pause();
    playBtn.textContent = '▶️ Play';
  }
});

videoEl.addEventListener('ended', () => {
  playBtn.textContent = '▶️ Play';
  drawPlayhead();
});
