import { useEffect, useState } from 'react';
import { dispatchToday, weekDatesFrom } from '@/lib/data';

/** Live dispatch day (flips at 5pm Phoenix without a full reload). */
export function useDispatchToday() {
  const [today, setToday] = useState(dispatchToday);
  useEffect(() => {
    const tick = () => {
      const next = dispatchToday();
      setToday(prev => (prev === next ? prev : next));
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return today;
}

export function useDispatchWeek() {
  const today = useDispatchToday();
  return { today, weekDates: weekDatesFrom(today) };
}
