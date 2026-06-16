import { useEffect, useState } from 'react';

const QUERY = '(max-width: 900px)';

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (typeof window.matchMedia === 'function') return window.matchMedia(QUERY).matches;
    } catch {
      // ignore
    }
    return window.innerWidth <= 900;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let cleanup = null;
    try {
      if (typeof window.matchMedia === 'function') {
        const media = window.matchMedia(QUERY);
        const onChange = (event) => setIsMobile(!!event.matches);

        // Safari/older WebView fallback
        if (typeof media.addEventListener === 'function') {
          media.addEventListener('change', onChange);
          cleanup = () => media.removeEventListener('change', onChange);
        } else if (typeof media.addListener === 'function') {
          media.addListener(onChange);
          cleanup = () => media.removeListener(onChange);
        } else {
          cleanup = null;
        }

        setIsMobile(media.matches);
      }
    } catch {
      cleanup = null;
    }

    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      if (cleanup) cleanup();
    };
  }, []);

  return isMobile;
}
