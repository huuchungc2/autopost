import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  WEEKDAY_LABELS,
  buildGregorianMonthGrid,
  dateKeyFromParts,
  formatMonthYear,
  todayDateKey,
  toDateKey,
} from '../utils/date';

export default function Calendar({ posts = [], onSelectDate, selectedDate = '' }) {
  const today = new Date();
  const todayKey = todayDateKey();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const postsByDate = useMemo(() => {
    const map = {};
    posts.forEach((post) => {
      if (!post.scheduled_at) return;
      const key = toDateKey(post.scheduled_at);
      if (!key) return;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [posts]);

  const cells = useMemo(
    () => buildGregorianMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const shiftMonth = (delta) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button type="button" className="calendar-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Tháng trước">
          <ChevronLeft size={18} />
        </button>
        <div className="calendar-header-center">
          <h3>{formatMonthYear(viewYear, viewMonth)}</h3>
          <button type="button" className="calendar-today-btn" onClick={goToday}>
            Hôm nay
          </button>
        </div>
        <button type="button" className="calendar-nav-btn" onClick={() => shiftMonth(1)} aria-label="Tháng sau">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="calendar-grid">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="calendar-day-label">{label}</div>
        ))}
        {cells.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} className="calendar-cell calendar-cell--empty" aria-hidden />;
          }
          const key = dateKeyFromParts(viewYear, viewMonth, day);
          const isToday = key === todayKey;
          const isSelected = selectedDate === key;
          const count = postsByDate[key];

          return (
            <button
              key={key}
              type="button"
              className={[
                'calendar-cell',
                isToday ? 'today' : '',
                isSelected ? 'selected' : '',
                count ? 'has-posts' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelectDate?.(key)}
            >
              <span className="calendar-day-num">{day}</span>
              {count ? <span className="calendar-dot">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <p className="calendar-footnote">Lịch dương · tuần bắt đầu Thứ Hai</p>
    </div>
  );
}
