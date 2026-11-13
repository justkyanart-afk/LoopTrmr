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

let zoomLevel = 1;
const MAX_ZOOM = 200;
let viewStart = 0;
let viewDuration = 0;

// Gestion des gestes
let activePointers = new Map();
let dragMode = null; // 'seek', 'window', 'pan', 'zoom'
let lastX = 0;
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

function calculateLoopSize() {
  const beatDuration = 60 / bpm;
  loopDuration = loopMeasures * 4 * beatDuration;
  if (loopStart + loopDuration > duration) loopStart = Math.max(0, duration - loopDuration);
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

function drawTimeline() {
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);
  if (!duration) return;

  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, w, h);

  // 1. Grille Musicale (BPM)
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

  // 2. Fenêtre de boucle
  const xStart = timeToX(loopStart);
  const xEnd = timeToX(loopEnd);
  
  ctx.fillStyle = 'rgba(45, 108, 223, 0.4)'; 
  ctx.fillRect(xStart, 0, xEnd - xStart, h);
  ctx.strokeStyle = '#2d6cdf'; 
  ctx.lineWidth = 3;
  ctx.strokeRect(xStart, 0, xEnd - xStart, h);

  // 3. Graduations intelligentes (anti-chevauchement)
  ctx.fillStyle = '#aaa';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  
  // Calcul de l'espacement idéal (pour avoir environ 4 à 6 textes à l'écran)
  let rawStep = viewDuration / 5;
  let mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  let norm = rawStep / mag;
  let step;
  if (norm < 1.5) step = 1 * mag;
  else if (norm < 3.5) step = 2 * mag;
  else if (norm < 7.5) step = 5 * mag;
  else step = 10 * mag;

  const startTick = Math.floor(viewStart / step) * step;
  const endTick = Math.ceil((viewStart + viewDuration) / step) * step;

  for (let t = startTick; t <= endTick; t += step) {
    const x = timeToX(t);
    if (x < -30 || x > w + 30) continue;
    
    ctx.fillRect(x, 0, 1, 8);
    
    let label;
    if (step < 1) {
        label = t.toFixed(2) + 's';
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

// ==========================================
// GESTION DES GESTES (Zoom & Balayage)
// ==========================================

canvas.addEventListener('touchstart', (e) => {
  if (!duration) return;
  e.preventDefault();

  for (let i = 0; i < e.changedTouches.length; i++) {
    activePointers.set(e.changedTouches[i].identifier, e.changedTouches[i]);
  }

  const rect = canvas.getBoundingClientRect();

  if (activePointers.size === 1) {
    const touch = e.touches[0];
    const clickTime = xToTime(touch.clientX - rect.left);
    lastX = touch.clientX;

    if (clickTime >= loopStart && clickTime <= loopEnd) {
      // Touche dans la zone bleue : on déplace la boucle
      dragMode = 'window';
    } else {
      // Touche en dehors de la zone bleue
      if (zoomLevel > 1) {
        // Si on est zoomé, on fait défiler la vue (PAN)
        dragMode = 'pan';
      } else {
        // Si on n'est pas zoomé, on déplace le curseur de lecture
        dragMode = 'seek';
        videoEl.currentTime = clickTime;
        drawPlayhead();
        updateTimeDisplay();
      }
    }
  } else if (activePointers.size === 2) {
    dragMode = 'zoom';
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    initialPinchDistance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
    initialZoomLevel = zoomLevel;
    
    const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
    initialPinchCenterTime = xToTime(centerX);
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (!duration) return;
  e.preventDefault();

  for (let i = 0; i < e.changedTouches.length; i++) {
    if (activePointers.has(e.changedTouches[i].identifier)) {
      activePointers.set(e.changedTouches[i].identifier, e.changedTouches[i]);
    }
  }

  const rect = canvas.getBoundingClientRect();

  if (dragMode === 'zoom' && activePointers.size >= 2) {
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    const currentDistance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
    
    if (initialPinchDistance > 0) {
      let newZoom = initialZoomLevel * (currentDistance / initialPinchDistance);
      newZoom = Math.max(1, Math.min(newZoom, MAX_ZOOM));
      zoomLevel = newZoom;

      const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
      viewDuration = duration / zoomLevel;
      viewStart = initialPinchCenterTime - (centerX / rect.width) * viewDuration;
      viewStart = Math.max(0, Math.min(viewStart, duration - viewDuration));
      drawPlayhead();
    }
  } 
  else if (dragMode === 'window' && activePointers.size === 1) {
    const touch = e.touches[0];
    const deltaX = touch.clientX - lastX;
    lastX = touch.clientX;
    
    let newStart = loopStart + (deltaX / rect.width) * viewDuration;
    
    if (magneticToggle.checked) {
      const beatDuration = 60 / bpm;
      newStart = Math.round(newStart / beatDuration) * beatDuration;
    }

    newStart = Math.max(0, Math.min(newStart, duration - loopDuration));
    loopStart = newStart;
    loopEnd = loopStart + loopDuration;
    drawPlayhead();
  }
  else if (dragMode === 'pan' && activePointers.size === 1) {
    // DÉFILEMENT DE LA TIMELINE
    const touch = e.touches[0];
    const deltaX = touch.clientX - lastX;
    lastX = touch.clientX;
    
    const deltaTime = (deltaX / rect.width) * viewDuration;
    // On recule la vue quand on tire vers la droite
    viewStart = viewStart - deltaTime;
    viewStart = Math.max(0, Math.min(viewStart, duration - viewDuration));
    drawPlayhead();
  }
  else if (dragMode === 'seek' && activePointers.size === 1) {
    const touch = e.touches[0];
    videoEl.currentTime = Math.max(0, Math.min(xToTime(touch.clientX - rect.left), duration));
    drawPlayhead();
    updateTimeDisplay();
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    activePointers.delete(e.changedTouches[i].identifier);
  }

  if (activePointers.size === 0) {
    dragMode = null;
  } else if (activePointers.size === 1) {
    // Si on relâche un doigt après un zoom, on repasse en mode "pan" (si zoomé) ou "seek"
    dragMode = (zoomLevel > 1) ? 'pan' : 'seek';
    lastX = e.touches[0].clientX;
  }
});

canvas.addEventListener('touchcancel', (e) => {
  activePointers.clear();
  dragMode = null;
});

// ==========================================
// LECTURE ET BOUCLE
// ==========================================

function loopAnim() {
  if (!videoEl.paused) {
    if (isLooping && videoEl.currentTime >= loopEnd) {
      videoEl.currentTime = loopStart;
    }
    
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
