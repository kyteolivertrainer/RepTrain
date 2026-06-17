import { todayIndex, dayToDate } from "@/lib/reptrain";

interface HeatmapProps {
  days: number[]; // day indices that have a logged session
  weeks?: number;
}

/** A GitHub-style training calendar: one cell per day, lit when a session was logged. */
export default function Heatmap({ days, weeks = 17 }: HeatmapProps) {
  const today = todayIndex();
  const set = new Set(days);

  // align the grid so the last column ends on today's weekday (Mon=0 … Sun=6)
  const jsDow = dayToDate(today).getUTCDay(); // 0=Sun..6=Sat
  const todayCol = (jsDow + 6) % 7; // shift so Monday is row 0
  const total = (weeks - 1) * 7 + todayCol + 1;
  const start = today - total + 1;

  const cells: { day: number; on: boolean }[] = [];
  for (let i = 0; i < total; i++) {
    const day = start + i;
    cells.push({ day, on: set.has(day) });
  }

  return (
    <div className="heat">
      {cells.map((cell) => (
        <div key={cell.day} className="heat-cell" data-on={cell.on} title={dayToDate(cell.day).toISOString().slice(0, 10)} />
      ))}
    </div>
  );
}
