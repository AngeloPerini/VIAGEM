export function registerTripFlowPwa() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Nao foi possivel registrar o service worker do TripFlow.', error);
    });
  });
}
