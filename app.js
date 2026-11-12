const statusEl = document.getElementById('status');

function setStatus(msg) {
  statusEl.textContent = msg;
}

// Enregistrement du service worker (nécessaire pour l'installation sur Android)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => setStatus('Prêt — service worker actif'))
      .catch(err => setStatus('Service worker KO : ' + err.message));
  });
} else {
  setStatus('Prêt — pas de service worker (ancien navigateur)');
}

// Détection du mode standalone (installée depuis l'écran d'accueil)
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

if (isStandalone) setStatus('Mode appli installée ✅');

// Espace pour les étapes futures — on garde des points d'ancrage propres
export const App = {
  version: '0.1',
  setStatus,
};
