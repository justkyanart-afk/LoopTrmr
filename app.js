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
const bipToggle = document.getElementById('bip-toggle');
const btnOffset = document.getElementById('btn-offset');

let duration = 0;
let bpm = 90;
let gridOffset = 0; // Décalage de la grille en secondes
let loopMeasures = 4;
let loopDuration = 0; 
let loopStart = 0;
let loopEnd = 0;
let isLooping = false;

let zoomLevel = 1;
const MAX_ZOOM = 200;
let viewStart = 0;
let viewDuration = 0;

// Audio & Métronome
let audioCtx = null;
let lastPlayedBeat = -1;

// Gestion des gestes
let activePointers = new Map();
let dragMode = null; 
let lastX = 0;
let lastTouchX = 0; 
let startTouchY = 0;
let lastMoveTime = 0;
let lastScrubTime = 0; // Pour limiter le scrubbing vidéo
let velocityHistory = [];
let momentumFrame = null;
let autoScrollFrame = null;
let initialPinchDistance = 0;
let initialZoomLevel = 1;
let initialPinchCenterTime = 0;

function setStatus(msg) { statusEl.textContent = msg; }

// Initialisation de l'audio (nécessite une action utilisateur sur iOS)
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

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
    gridOffset = 0;
    calculateLoopSize();
    
    setTimeout(() => {
      resizeCanvas();
      drawPlayhead();
      updateTimeDisplay();
    }, 50);
    setStatus(`✅ Clip prêt (${duration.toFixed(1)} s)`);
  }
}
videoEl.addEventListener('loadedmetadata', updateDuration);
videoEl.addEventListener('durationchange', updateDuration);

// --- LOGIQUE DE LA GRILLE ET DU BPM ---
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

// Bouton pour caler la grille sur le temps actuel
btnOffset.addEventListener('click', () => {
  // On trouve le temps du beat le plus proche de la tête de lecture
  const currentT = videoEl.currentTime;
  gridOffset = currentT; 
  // On repositionne la boucle pour qu'elle commence sur ce nouveau temps
  loopStart = currentT;
  calculateLoopSize();
  setStatus(`Grille calée sur ${formatTime(currentT)}`);
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

// --- DESSIN DE LA TIMELINE ---
function drawTimeline() {
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);
  if (!duration) return;

  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, w, h);

  // Dessin de la grille musicale (avec décalage)
  const beatDuration = 60 / bpm;
  
  // On cherche le premier beat visible à l'écran
  let firstBeatIndex = Math.floor((viewStart - gridOffset) / beatDuration);
  let t = gridOffset + firstBeatIndex * beatDuration;
  
  while (t <= viewStart + viewDuration) {
    if (t >= 0) {
      const x = timeToX(t);
      if (x >= 0 && x <= w) {
        const isMeasure = firstBeatIndex % 4 === 0;
        ctx.beginPath();
        ctx.lineWidth = isMeasure ? 2 : 1;
        ctx.strokeStyle = isMeasure ? '#555' : '#333';
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    }
    firstBeatIndex++;
    t = gridOffset + firstBeatIndex * beatDuration;
  }

  // Fenêtre bleue
  const xStart = timeToX(loopStart);
  const xEnd = timeToX(loopEnd);
  
  ctx.fillStyle = 'rgba(45, 108, 223, 0.4)'; 
  ctx.fillRect(xStart, 0, xEnd - xStart, h);
  ctx.strokeStyle = '#2d6cdf'; 
  ctx.lineWidth = 3;
  ctx.strokeRect(xStart, 0, xEnd - xStart, h);

  // Graduations
  ctx.fillStyle = '#aaa';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  
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

  for (let i = startTick; i <= endTick; i += step) {
    const x = timeToX(i);
    if (x < -30 || x > w + 30) continue;
    ctx.fillRect(x, 0, 1, 8);
    let label = (step < 1) ? i.toFixed(2) + 's' : formatTime(i).split('.')[0];
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
  if (!isFinite(s) || s < 0) return "00:00.000";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 1000);
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function updateTimeDisplay() {
  if (dragMode === 'window' || dragMode === 'auto-scroll') {
    timeDisplay.textContent = `▶ Début: ${formatTime(loopStart)}`;
    timeDisplay.style.color = '#4cd964';
  } else {
    timeDisplay.textContent = `${formatTime(videoEl.currentTime)} / ${formatTime(duration)}`;
    timeDisplay.style.color = 'var(--accent)';
  }
}

// --- JOUER LE BIP ---
function playBip() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1000, audioCtx.currentTime); // Fréquence du bip
  gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05); // Extinction rapide
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.05);
}

// ==========================================
// INERTIE ET AUTO-SCROLL
// ==========================================
function startMomentum(velocity) {
  cancelAnimationFrame(momentumFrame);
  let v = velocity;
  function animate() {
    if (Math.abs(v) < 0.001) return; 
    let newStart = viewStart - v;
    if (newStart <= 0) { newStart = 0; v = 0; }
    else if (newStart >= duration - viewDuration) { newStart = duration - viewDuration; v = 0; }
    viewStart = newStart;
    drawPlayhead();
    v *= 0.95; 
    momentumFrame = requestAnimationFrame(animate);
  }
  animate();
}

function autoScrollLoop() {
  if (dragMode !== 'window') return;
  
  const rect = canvas.getBoundingClientRect();
  const edgeThreshold = 50; 
  let scrollSpeed = 0;
  
  if (lastTouchX < rect.left + edgeThreshold) {
     scrollSpeed = -((rect.left + edgeThreshold - lastTouchX) / edgeThreshold) * (viewDuration * 0.02);
  } else if (lastTouchX > rect.right - edgeThreshold) {
     scrollSpeed = ((lastTouchX - (rect.right - edgeThreshold)) / edgeThreshold) * (viewDuration * 0.02);
  }

  if (scrollSpeed !== 0) {
    let newViewStart = Math.max(0, Math.min(viewStart + scrollSpeed, duration - viewDuration));
    let actualScroll = newViewStart - viewStart;
    viewStart = newViewStart;
    
    loopStart = Math.max(0, Math.min(loopStart + actualScroll, duration - loopDuration));
    loopEnd = loopStart + loopDuration;
    
    // Scrub vidéo pendant l'auto-scroll
    const now = performance.now();
    if (now - lastScrubTime > 50) {
      videoEl.currentTime = loopStart;
      lastScrubTime = now;
    }
    
    updateTimeDisplay(); 
    drawPlayhead();
  }
  autoScrollFrame = requestAnimationFrame(autoScrollLoop);
}

// ==========================================
// GESTION DES GESTES
// ==========================================
canvas.addEventListener('touchstart', (e) => {
  if (!duration) return;
  e.preventDefault();
  initAudio(); // Déverrouille l'audio iOS au premier toucher

  cancelAnimationFrame(momentumFrame);
  cancelAnimationFrame(autoScrollFrame);
  velocityHistory = [];

  for (let i = 0; i < e.changedTouches.length; i++) {
    activePointers.set(e.changedTouches[i].identifier, e.changedTouches[i]);
  }

  const rect = canvas.getBoundingClientRect();

  if (activePointers.size === 1) {
    const touch = e.touches[0];
    lastTouchX = touch.clientX;
    lastX = touch.clientX;
    startTouchY = touch.clientY - rect.top;
    lastMoveTime = performance.now();
    
    const clickTime = xToTime(touch.clientX - rect.left);
    const isTopBand = startTouchY < 25;

    if (!isTopBand && clickTime >= loopStart && clickTime <= loopEnd) {
      dragMode = 'window';
      autoScrollLoop(); 
      updateTimeDisplay();
    } else {
      if (zoomLevel > 1) {
        dragMode = 'pan';
      } else {
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
    lastTouchX = touch.clientX;
    const deltaX = touch.clientX - lastX;
    lastX = touch.clientX;
    
    let newStart = loopStart + (deltaX / rect.width) * viewDuration;
    newStart = Math.max(0, Math.min(newStart, duration - loopDuration));
    
    loopStart = newStart;
    loopEnd = loopStart + loopDuration;
    
    // --- SCRUBBING VIDÉO (Défilement des images) ---
    const now = performance.now();
    if (now - lastScrubTime > 50) { // Limite à 20 fps pour la performance
      videoEl.currentTime = loopStart;
      lastScrubTime = now;
    }
    
    updateTimeDisplay(); 
    drawPlayhead();
  }
  else if (dragMode === 'pan' && activePointers.size === 1) {
    const touch = e.touches[0];
    lastTouchX = touch.clientX;
    const deltaX = touch.clientX - lastX;
    lastX = touch.clientX;

    const now = performance.now();
    const dt = now - lastMoveTime;
    if (dt > 10) {
      velocityHistory.push((deltaX / rect.width) * viewDuration / dt);
      if (velocityHistory.length > 3) velocityHistory.shift();
      lastMoveTime = now;
    }
    
    const deltaTime = (deltaX / rect.width) * viewDuration;
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
    cancelAnimationFrame(autoScrollFrame);
    
    // Aimantation au relâchement
    if (dragMode === 'window' && magneticToggle.checked) {
      const beatDuration = 60 / bpm;
      // Calcul du beat le plus proche en tenant compte du gridOffset
      const relativeStart = loopStart - gridOffset;
      const nearestBeat = Math.round(relativeStart / beatDuration);
      loopStart = gridOffset + nearestBeat * beatDuration;
      
      loopStart = Math.max(0, Math.min(loopStart, duration - loopDuration));
      loopEnd = loopStart + loopDuration;
      
      // On remet la vidéo exactement sur le début calé
      videoEl.currentTime = loopStart;
      drawPlayhead();
    }

    if (dragMode === 'pan' && velocityHistory.length > 0) {
      const avgVelocity = velocityHistory.reduce((a, b) => a + b, 0) / velocityHistory.length;
      startMomentum(avgVelocity * 16); 
    }
    
    dragMode = null;
    updateTimeDisplay(); 
  } else if (activePointers.size === 1) {
    dragMode = (zoomLevel > 1) ? 'pan' : 'seek';
    lastX = e.touches[0].clientX;
    lastTouchX = lastX;
    cancelAnimationFrame(autoScrollFrame);
    updateTimeDisplay();
  }
});

canvas.addEventListener('touchcancel', (e) => {
  activePointers.clear();
  dragMode = null;
  cancelAnimationFrame(autoScrollFrame);
  cancelAnimationFrame(momentumFrame);
  updateTimeDisplay();
});

// ==========================================
// LECTURE ET BOUCLE
// ==========================================
function loopAnim() {
  if (!videoEl.paused) {
    if (isLooping && videoEl.currentTime >= loopEnd) {
      videoEl.currentTime = loopStart;
      lastPlayedBeat = -1; // Réinitialise pour le bip
    }
    
    // Métronome (Bip)
    if (bipToggle.checked && audioCtx && audioCtx.state === 'running') {
      const beatDuration = 60 / bpm;
      const relativeTime = videoEl.currentTime - gridOffset;
      const currentBeatIndex = Math.floor(relativeTime / beatDuration);
      
      // Si on a passé un nouveau temps
      if (currentBeatIndex !== lastPlayedBeat && currentBeatIndex >= 0) {
        playBip();
        lastPlayedBeat = currentBeatIndex;
      }
    }

    if (videoEl.currentTime < viewStart || videoEl.currentTime > viewStart + viewDuration) {
        viewStart = Math.max(0, Math.min(videoEl.currentTime - viewDuration/2, duration - viewDuration));
    }

    if (!dragMode) {
      drawPlayhead();
      updateTimeDisplay();
    }
    requestAnimationFrame(loopAnim);
  }
}

playBtn.addEventListener('click', () => {
  initAudio();
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
  initAudio();
  isLooping = !isLooping;
  if (isLooping) {
    videoEl.currentTime = loopStart;
    videoEl.play();
    playBtn.textContent = '⏸ Pause';
    loopPlayBtn.textContent = '⏹ Stop Boucle';
    loopPlayBtn.classList.add('active-loop');
    lastPlayedBeat = -1;
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
