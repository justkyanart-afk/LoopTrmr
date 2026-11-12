const statusEl = document.getElementById('status');
const videoEl = document.getElementById('video');
const fileInput = document.getElementById('file-input');
const playBtn = document.getElementById('play-btn');
const loopPlayBtn = document.getElementById('loop-play-btn');
const canvas = document.getElementById('timeline-canvas');
const ctx = canvas.getContext('2d');
const timeDisplay = document.getElementById('time-display');
const btn4s = document.getElementById('btn-4s');
const btn8s = document.getElementById('btn-8s');

let duration = 0;
let isSeeking = false;

// --- Variables de la boucle ---
let loopDuration = 4; // en secondes
let loopStart = 0;
let loopEnd = 4;
let isLooping = false;

// --- Variables de drag (glissement) ---
let isDraggingWindow = false;
let dragStartX = 0;
let dragStartLoopStart = 0;

function setStatus(msg) { statusEl.textContent = msg; }

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// --- Gestion du chargement ---
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024 * 1024) { setStatus("❌ Fichier > 3 Go"); return; }

  setStatus("⏳ Chargement...");
  setTimeout(() => {
    videoEl.src = URL.createObjectURL(file);
    videoEl.load();
    playBtn.disabled = false;
    loopPlayBtn.disabled = false;
  }, 100);
});

function updateDuration() {
  if (isFinite(videoEl.duration) && videoEl.duration > 0) {
    duration = videoEl.duration;
    // Initialiser la boucle
    loopStart = 0;
    loopEnd = Math.min(loopDuration, duration);
    
    resizeCanvas();
    drawPlayhead();
    updateTimeDisplay();
    setStatus(`✅ Clip prêt (${duration.toFixed(1)} s)`);
  }
}
videoEl.addEventListener('loadedmetadata', updateDuration);
videoEl.addEventListener('durationchange', updateDuration);

// --- Timeline et Dessin ---
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
}

function drawTimeline() {
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);
  if (!duration) return;

  // Fond
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, w, h);

  // Fenêtre de boucle (Zone bleue)
  const xStart = (loopStart / duration) * w;
  const xEnd = (loopEnd / duration) * w;
  ctx.fillStyle = 'rgba(45, 108, 223, 0.3)'; // Bleu transparent
  ctx.fillRect(xStart, 0, xEnd - xStart, h);
  ctx.strokeStyle = '#2d6cdf';
  ctx.lineWidth = 2;
  ctx.strokeRect(xStart, 0, xEnd - xStart, h);

  // Graduations (Secondes)
  ctx.fillStyle = '#666';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  const step = duration > 60 ? 10 : (duration > 10 ? 5 : 1);
  for (let i = 0; i <= duration; i += step) {
    const x = (i / duration) * w;
    ctx.fillRect(x, 0, 1, 10);
    ctx.fillText(formatTime(i).split('.')[0], x, h - 5);
  }
}

function drawPlayhead() {
  drawTimeline();
  if (!duration) return;
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  const x = (videoEl.currentTime / duration) * w;

  ctx.fillStyle = '#fff'; // Curseur blanc pour contraster avec le bleu
  ctx.fillRect(x - 1, 0, 2, h);
  ctx.beginPath();
  ctx.arc(x, 8, 5, 0, Math.PI * 2);
  ctx.fill();
}

function formatTime(s) {
  if (!isFinite(s)) return "00:00.0";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 10);
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms}`;
}

function updateTimeDisplay() {
  timeDisplay.textContent = `${formatTime(videoEl.currentTime)} / ${formatTime(duration)}`;
}

// --- Interactions (Glisser la boucle ou cliquer pour naviguer) ---
function seek(e) {
  if (!duration) return;
  const rect = canvas.getBoundingClientRect();
  const clientX = e.clientX;
  const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
  videoEl.currentTime = (x / rect.width) * duration;
  drawPlayhead();
  updateTimeDisplay();
}

canvas.addEventListener('pointerdown', (e) => {
  if (!duration) return;
  const rect = canvas.getBoundingClientRect();
  const clickTime = ((e.clientX - rect.left) / rect.width) * duration;

  // Si on clique DANS la zone bleue, on glisse la boucle
  if (clickTime >= loopStart && clickTime <= loopEnd) {
    isDraggingWindow = true;
    dragStartX = e.clientX;
    dragStartLoopStart = loopStart;
  } else {
    // Sinon, on déplace le curseur de lecture
    isSeeking = true;
    seek(e);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!duration) return;
  
  if (isDraggingWindow) {
    const rect = canvas.getBoundingClientRect();
    const deltaX = e.clientX - dragStartX;
    const deltaTime = (deltaX / rect.width) * duration;
    
    let newStart = dragStartLoopStart + deltaTime;
    // On empêche la boucle de sortir de la vidéo
    newStart = Math.max(0, Math.min(newStart, duration - loopDuration));
    
    loopStart = newStart;
    loopEnd = loopStart + loopDuration;
    drawPlayhead();
  } else if (isSeeking) {
    seek(e);
  }
});

window.addEventListener('pointerup', () => {
  isSeeking = false;
  isDraggingWindow = false;
});

// --- Boutons 4s / 8s ---
function setLoopSize(size) {
  loopDuration = size;
  loopEnd = Math.min(loopStart + loopDuration, duration);
  if (loopEnd - loopStart < loopDuration) {
    loopStart = Math.max(0, loopEnd - loopDuration);
  }
  btn4s.classList.toggle('active', size === 4);
  btn8s.classList.toggle('active', size === 8);
  drawPlayhead();
}
btn4s.onclick = () => setLoopSize(4);
btn8s.onclick = () => setLoopSize(8);

// --- Lecture Vidéo et Boucle ---
function loopAnim() {
  if (!videoEl.paused) {
    // Si on est en mode boucle et qu'on atteint la fin
    if (isLooping && videoEl.currentTime >= loopEnd) {
      videoEl.currentTime = loopStart;
    }
    drawPlayhead();
    updateTimeDisplay();
    requestAnimationFrame(loopAnim);
  }
}

playBtn.addEventListener('click', () => {
  isLooping = false;
  loopPlayBtn.classList.remove('active-loop');
  loopPlayBtn.textContent = '🔁 Boucle';

  if (videoEl.paused) {
    videoEl.play();
    playBtn.textContent = '⏸ Pause';
    requestAnimationFrame(loopAnim);
  } else {
    videoEl.pause();
    playBtn.textContent = '▶️ Play';
  }
});

loopPlayBtn.addEventListener('click', () => {
  isLooping = !isLooping;
  if (isLooping) {
    // Démarrer la boucle
    videoEl.currentTime = loopStart;
    videoEl.play();
    playBtn.textContent = '⏸ Pause';
    loopPlayBtn.textContent = '⏹ Stop Boucle';
    loopPlayBtn.classList.add('active-loop');
    requestAnimationFrame(loopAnim);
  } else {
    // Arrêter
    videoEl.pause();
    playBtn.textContent = '▶️ Play';
    loopPlayBtn.textContent = '🔁 Boucle';
    loopPlayBtn.classList.remove('active-loop');
  }
});

videoEl.addEventListener('ended', () => {
  playBtn.textContent = '▶️ Play';
  drawPlayhead();
});
