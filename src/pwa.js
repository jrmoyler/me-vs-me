// Installable web app: registers the service worker and tracks whether the browser can
// install the game (Chrome, Edge and Android hand over a prompt; iOS needs Share → Add to
// Home Screen; an installed copy needs nothing).
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(installState()));

export const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches ||
  matchMedia("(display-mode: fullscreen)").matches ||
  navigator.standalone === true;
export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function installState() {
  if (isStandalone()) return "installed";
  if (deferred) return "prompt";
  return isIOS() ? "ios" : "none";
}
export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export async function promptInstall() {
  if (!deferred) return "unavailable";
  const event = deferred;
  deferred = null;
  event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome;
}

export function registerPWA() {
  addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event;
    notify();
  });
  addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
  // Only a production build served over HTTP(S) gets the worker; dev servers and the
  // single-file offline package (file://) stay uncached.
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol) || !import.meta.env?.PROD) return;
  const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
  if (document.readyState === "complete") register();
  else addEventListener("load", register, { once: true });
}
