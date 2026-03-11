const parseDatePreserveCalendarDay = (value) => {
  if (!value) {
    return null;
  }

  // Preserve the API calendar day regardless of client timezone.
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(year, month - 1, day);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatShortDate = (value, fallback = 'TBD') => {
  const date = parseDatePreserveCalendarDay(value);
  if (!date) {
    return fallback;
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const formatLongDate = (value, fallback = 'TBD') => {
  const date = parseDatePreserveCalendarDay(value);
  if (!date) {
    return fallback;
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const formatMonthYear = (value, fallback = 'Unknown') => {
  const date = parseDatePreserveCalendarDay(value);
  if (!date) {
    return fallback;
  }

  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
};
