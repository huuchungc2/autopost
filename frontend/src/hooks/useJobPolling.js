import { useEffect, useRef } from 'react';

export default function useJobPolling(batchId, onUpdate, enabled = true, intervalMs = 3000) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    if (!batchId || !enabled) return undefined;

    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/jobs/${batchId}/status`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('autopost_token')}` },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) callbackRef.current(data);
      } catch {
        /* ignore polling errors */
      }
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [batchId, enabled, intervalMs]);
}
