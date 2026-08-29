(() => {
  'use strict';
  const root = document.querySelector('#app');
  if (!globalThis.__GODAGENT_LOCAL__?.sessionToken) {
    root.textContent = 'The local creator session is unavailable.';
  }
})();
