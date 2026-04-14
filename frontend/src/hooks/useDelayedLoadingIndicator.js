import { useEffect, useState } from 'react';

export default function useDelayedLoadingIndicator(isLoading, delayMs = 1000) {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShouldShow(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      setShouldShow(true);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [isLoading, delayMs]);

  return shouldShow;
}
