const statusEl = document.getElementById('status');
const videoEl = document.getElementById('video');
const fileInput = document.getElementById('file-input');
const playBtn = document.getElementById('play-btn');
const loopPlayBtn = document.getElementById('loop-play-btn');
const canvas = document.getElementById('timeline-canvas');
const ctx = canvas.getContext('2d');
const timeDisplay = document.getElementById('time-display');
const btn4m = document.getElementById('btn-4m');
const btn8m = document.getElementById('btn-8m');
const bpmInput = document.getElementById('bpm-input');
const magneticToggle = document.getElementById('magnetic-toggle');

let duration = 0;
let bpm = 90;
let loopMeasures = 4;
let loopDuration = 0; 
let loopStart = 0;
let loopEnd = 0;
let isLooping = false;

// --- Variables de Vue (Zoom & Défilement) ---
let zoomLevel = 1; // 1 = vue totale. 10 = zoomé x10. Max = 100.
const MAX_ZOOM = 100;
let viewStart = 0; // Temps (en secondes) au bord gauche de l'écran
let viewDuration = 0; // Durée visible à l'écran

// --- Gestions des gestes ---
let dragMode = null; // 'seek', 'window', 'pan'
let dragStartX = 0;
let dragStartLoopStart = 0;
let dragStartViewStart = 0;
let initialPinchDistance = 0;
let initialZoomLevel = 1;
let initialPinchCenterTime = 0;

function setStatus(msg) { statusEl.textContent = msg; }

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

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
    zoomLevel = 1;
    viewStart = 0;
    viewDuration = duration;
    calculateLoopSize();
    
    setTimeout(() => {
      resizeCanvas();
      drawPlayhead();
      updateTimeDisplay();
    }, 50);
    setStatus(`✅ Clip prêt (${duration.toFixed(1)} s) - Pincez pour zoomer`);
  }
}
videoEl.addEventListener('loadedmetadata', updateDuration);
videoEl.addEventListener('durationchange', updateDuration);

// --- Calculs Musicaux ---
function calculateLoopSize() {
  const beatDuration = 60 / bpm;
  loopDuration = loopMeasures * 4 * beatDuration;
  
  if (loopStart + loopDuration > duration) {
    loopStart = Math.max(0, duration - loopDuration);
  }
  loopEnd = loopStart + loopDuration;
  drawPlayhead();
}

bpmInput.addEventListener('input', (e) => {
  bpm = parseFloat(e.target.value) || 90;
  calculateLoopSize();
});

function setMeasures(measures) {
  loopMeasures = measures;
  btn4m.classList.toggle('active', measures === 4);
  btn8m.classList.toggle('active', measures === 8);
  calculateLoopSize();
}
btn4m.onclick = () => setMeasures(4);
btn8m.onclick = () => setMeasures(8);

// --- Fonctions de conversion Vue <-> Temps ---
function timeToX(t) {
  const w = canvas.width / (window.devicePixelRatio || 1);
  return ((t - viewStart) / viewDuration) * w;
}

function xToTime(x) {
  const w = canvas.width / (window.devicePixelRatio || 1);
  return viewStart + (x / w) * viewDuration;
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
}

// --- Dessin de la Timeline ---
function drawTimeline() {
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);
  if (!duration) return;

  // 1. Fond
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, w, h);

  // 2. Grille Musicale (BPM)
  const beatDuration = 60 / bpm;
  const startBeat = Math.floor(viewStart / beatDuration);
  const endBeat = Math.ceil((viewStart + viewDuration) / beatDuration);

  for (let i = startBeat; i <= endBeat; i++) {
    const t = i * beatDuration;
    const x = timeToX(t);
    
    if (x < 0 || x > w) continue;

    const isMeasure = i % 4 === 0;
    ctx.beginPath();
    ctx.lineWidth = isMeasure ? 2 : 1;
    ctx.strokeStyle = isMeasure ? '#555' : '#333';
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // 3. Fenêtre de boucle
  const xStart = timeToX(loopStart);
  const xEnd = timeToX(loopEnd);
  
  ctx.fillStyle = 'rgba(45, 108, 223, 0.4)'; 
  ctx.fillRect(xStart, 0, xEnd - xStart, h);
  ctx.strokeStyle = '#2d6cdf'; 
  ctx.lineWidth = 3;
  ctx.strokeRect(xStart, 0, xEnd - xStart, h);

  // 4. Graduations (Secondes ou Millisecondes selon le zoom)
  ctx.fillStyle = '#aaa';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  
  // Choix de l'intervalle selon la durée visible
  let step = 1;
  if (viewDuration > 60) step = 10;
  else if (viewDuration > 10) step = 2;
  else if (viewDuration > 2) step = 0.5;
  else step = 0.1; // Vue très zoomée : par tranche de 100ms

  const startTick = Math.floor(viewStart / step) * step;
  const endTick = Math.ceil((viewStart + viewDuration) / step) * step;

  for (let t = startTick; t <= endTick; t += step) {
    const x = timeToX(t);
    if (x < -20 || x > w + 20) continue;
    
    ctx.fillRect(x, 0, 1, 8);
    
    // Affichage du texte (avec les millisecondes si on est très zoomé)
    let label;
    if (viewDuration < 2) {
        label = (t).toFixed(2) + 's';
    } else {
        label = formatTime(t).split('.')[0];
    }
    ctx.fillText(label, x, h - 5);
  }
}

function drawPlayhead() {
  drawTimeline();
  if (!duration) return;
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  const x = timeToX(videoEl.currentTime);

  // Ne dessiner le curseur que s'il est visible à l'écran
  if (x >= 0 && x <= w) {
    ctx.fillStyle = '#fff'; 
    ctx.fillRect(x - 1, 0, 2, h);
    ctx.beginPath();
    ctx.arc(x, 8, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function formatTime(s) {
  if (!isFinite(s) || s < 0) return "00:00.0";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 10);
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms}`;
}

function updateTimeDisplay() {
  timeDisplay.textContent = `${formatTime(videoEl.currentTime)} / ${formatTime(duration)}`;
}

// --- Gestion des gestes tactiles (Pinch to Zoom) ---
function getDistance(touches) {
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}

canvas.addEventListener('touchstart', (e) => {
  if (!duration) return;
  if (e.touches.length === 2) {
    // Début du zoom
    dragMode = 'zoom';
    initialPinchDistance = getDistance(e.touches);
    initialZoomLevel = zoomLevel;
    
    // Garder le point central sous les doigts fixe pendant le zoom
    const rect = canvas.getBoundingClientRect();
    const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
    initialPinchCenterTime = xToTime(centerX);
  } else if (e.touches.length === 1) {
    // Gestion à un doigt
    const rect = canvas.getBoundingClientRect();
    const clickX = e.touches[0].clientX - rect.left;
    const clickTime = xToTime(clickX);

    // Si on touche la fenêtre bleue
    if (clickTime >= loopStart && clickTime <= loopEnd) {
      dragMode = 'window';
      dragStartX = e.touches[0].clientX;
      dragStartLoopStart = loopStart;
    } else {
      // Sinon, déplacement de la tête de lecture ou navigation (pan)
      // On décide de faire du seek pour l'instant
      dragMode = 'seek';
      videoEl.currentTime = clickTime;
      drawPlayhead();
      updateTimeDisplay();
    }
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (!duration) return;
  e.preventDefault(); // Empêche le zoom de la page Safari

  if (dragMode === 'zoom' && e.touches.length === 2) {
    const currentDistance = getDistance(e.touches);
    const zoomRatio = currentDistance / initialPinchDistance;
    
    let newZoom = initialZoomLevel * zoomRatio;
    newZoom = Math.max(1, Math.min(newZoom, MAX_ZOOM));
    zoomLevel = newZoom;

    const rect = canvas.getBoundingClientRect();
    const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
    
    // Recalculer viewDuration et viewStart
    viewDuration = duration / zoomLevel;
    // Formule pour garder le point central stable :
    viewStart = initialPinchCenterTime - (centerX / rect.width) * viewDuration;
    
    // Limites
    viewStart = Math.max(0, Math.min(viewStart, duration - viewDuration));
    
    drawPlayhead();

  } else if (dragMode === 'window' && e.touches.length === 1) {
    const rect = canvas.getBoundingClientRect();
    const deltaX = e.touches[0].clientX - dragStartX;
    const deltaTime = (deltaX / rect.width) * viewDuration;
    let newStart = dragStartLoopStart + deltaTime;
    
    if (magneticToggle.checked) {
      const beatDuration = 60 / bpm;
      newStart = Math.round(newStart / beatDuration) * beatDuration;
    }

    newStart = Math.max(0, Math.min(newStart, duration - loopDuration));
    loopStart = newStart;
    loopEnd = loopStart + loopDuration;
    drawPlayhead();

  } else if (dragMode === 'seek' && e.touches.length === 1) {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.touches[0].clientX - rect.left;
    videoEl.currentTime = Math.max(0, Math.min(xToTime(clickX), duration));
    drawPlayhead();
    updateTimeDisplay();
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  if (e.touches.length === 0) {
    dragMode = null;
  } else if (e.touches.length === 1) {
    // Si on passe de 2 doigts à 1 doigt, on évite un saut bizarre
    dragMode = 'seek'; 
  }
});

// --- Lecture et Boucle ---
function loopAnim() {
  if (!videoEl.paused) {
    if (isLooping && videoEl.currentTime >= loopEnd) {
      videoEl.currentTime = loopStart;
    }
    
    // Auto-scroll de la vue si la tête de lecture sort de l'écran pendant la lecture
    if (videoEl.currentTime < viewStart || videoEl.currentTime > viewStart + viewDuration) {
        viewStart = Math.max(0, Math.min(videoEl.currentTime - viewDuration/2, duration - viewDuration));
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
    videoEl.currentTime = loopStart;
    videoEl.play();
    playBtn.textContent = '⏸ Pause';
    loopPlayBtn.textContent = '⏹ Stop Boucle';
    loopPlayBtn.classList.add('active-loop');
    requestAnimationFrame(loopAnim);
  } else {
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
