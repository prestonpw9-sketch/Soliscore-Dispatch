import { useEffect, useState } from 'react';
import { dispatchBoardWorkDate, isDispatchBoardShowingTomorrow } from '@/lib/data';

/** Recomputes Dispatch Board work date every minute (5 PM Phoenix rollover). */
export function useDispatchBoardDate() {
  const [workDate, setWorkDate] = useState(() => dispatchBoardWorkDate());
  const [showingTomorrow, setShowingTomorrow] = useState(() => isDispatchBoardShowingTomorrow());

  useEffect(() => {
    const tick = () => {
      setWorkDate(dispatchBoardWorkDate());
      setShowingTomorrow(isDispatchBoardShowingTomorrow());
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return { workDate, showingTomorrow };
}
