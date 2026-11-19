// One WebSocket that keeps itself alive. Phones lock, Wi-Fi blips, tabs sleep.
export function connect({ onOpen, onMessage, onStatus }) {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  let ws = null;
  let tries = 0;
  let stopped = false;
  let timer = null;

  function open() {
    clearTimeout(timer);
    if (stopped) return;
    ws = new WebSocket(url);
    ws.onopen = () => {
      tries = 0;
      if (onStatus) onStatus(true);
      if (onOpen) onOpen();
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      onMessage(msg);
    };
    ws.onclose = () => {
      if (onStatus) onStatus(false);
      if (!stopped) timer = setTimeout(open, Math.min(4000, 300 * 2 ** tries++));
    };
    ws.onerror = () => {
      try { ws.close(); } catch { /* already closed */ }
    };
  }

  // A phone waking up should not wait out the backoff.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !stopped && ws && ws.readyState > 1) {
      tries = 0;
      open();
    }
  });

  open();

  return {
    send(obj) {
      if (!ws || ws.readyState !== 1) return false;
      ws.send(JSON.stringify(obj));
      return true;
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      if (ws) ws.close();
    },
  };
}
