function timeAgo(sqliteDateStr) {
  // sqliteDateStr is 'YYYY-MM-DD HH:MM:SS' in UTC (datetime('now'))
  const then = new Date(sqliteDateStr.replace(' ', 'T') + 'Z').getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSec < 60) return 'الآن';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `منذ ${diffMin} ${diffMin === 1 ? 'دقيقة' : 'دقائق'}`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `منذ ${diffHour} ${diffHour === 1 ? 'ساعة' : 'ساعات'}`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `منذ ${diffDay} ${diffDay === 1 ? 'يوم' : 'أيام'}`;
  const diffMonth = Math.floor(diffDay / 30);
  return `منذ ${diffMonth} ${diffMonth === 1 ? 'شهر' : 'أشهر'}`;
}

function parseUrlEncoded(body) {
  const out = {};
  new URLSearchParams(body).forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

module.exports = { timeAgo, parseUrlEncoded };
