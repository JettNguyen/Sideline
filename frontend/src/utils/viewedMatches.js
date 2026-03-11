const VIEWED_MATCHES_STORAGE_KEY = 'sideline.viewedMatches';

export const getViewedMatchIds = () => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(VIEWED_MATCHES_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch (error) {
    console.error('Could not read viewed matches:', error);
    return [];
  }
};

export const getViewedMatchIdSet = () => new Set(getViewedMatchIds());

export const markMatchViewed = (matchId) => {
  if (!matchId || typeof window === 'undefined') {
    return;
  }

  const viewedMatchIds = getViewedMatchIdSet();
  viewedMatchIds.add(matchId);
  window.localStorage.setItem(
    VIEWED_MATCHES_STORAGE_KEY,
    JSON.stringify(Array.from(viewedMatchIds))
  );
};
