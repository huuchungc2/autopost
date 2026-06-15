import { useMemo } from 'react';

const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export default function Calendar({ posts = [], onSelectDate }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const postsByDate = useMemo(() => {
    const map = {};
    posts.forEach((post) => {
      if (!post.scheduled_at) return;
      const key = post.scheduled_at.slice(0, 10);
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [posts]);

  const cells = [];
  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  const dateKey = (day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return (
    <div className="calendar">
      <div className="calendar-header">
        <h3>{today.toLocaleString('vi-VN', { month: 'long', year: 'numeric' })}</h3>
      </div>
      <div className="calendar-grid">
        {DAYS.map((d) => (
          <div key={d} className="calendar-day-label">{d}</div>
        ))}
        {cells.map((day, idx) => (
          <button
            key={idx}
            type="button"
            className={`calendar-cell ${day === today.getDate() ? 'today' : ''} ${day && postsByDate[dateKey(day)] ? 'has-posts' : ''}`}
            disabled={!day}
            onClick={() => day && onSelectDate?.(dateKey(day))}
          >
            {day || ''}
            {day && postsByDate[dateKey(day)] ? <span className="calendar-dot">{postsByDate[dateKey(day)]}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
