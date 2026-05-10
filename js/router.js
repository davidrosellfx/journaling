// Hash-based router. Each route is a function (params, container) → cleanup() | void

const routes = new Map();
let currentCleanup = null;
let onChange = null;

export const router = {
  add(path, handler) { routes.set(path, handler); return this; },
  start(container, fallback = '#/dashboard') {
    const handle = () => {
      const hash = window.location.hash || fallback;
      const [path] = hash.split('?');
      const handler = routes.get(path) || routes.get(fallback);
      if (currentCleanup) { try { currentCleanup(); } catch (e) {} currentCleanup = null; }
      container.innerHTML = '';
      const cleanup = handler ? handler({}, container) : null;
      if (typeof cleanup === 'function') currentCleanup = cleanup;
      if (onChange) onChange(path);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', handle);
    if (!window.location.hash) window.location.hash = fallback;
    handle();
  },
  go(path) {
    if (window.location.hash === path) {
      // force re-render
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      window.location.hash = path;
    }
  },
  onChange(fn) { onChange = fn; },
  current() { return (window.location.hash || '').split('?')[0]; },
};
