const WORDS = ["Show up", "Stake it", "Log it daily", "Don't miss", "Keep the chain", "No excuses"];

/** A stadium-style tape ribbon that scrolls the creed. One set is rendered twice so the
 *  -50% translate loops seamlessly. */
export default function Ribbon() {
  return (
    <div className="ribbon" aria-hidden="true">
      <div className="ribbon-track">
        {[0, 1].map((dup) =>
          WORDS.map((w, i) => (
            <span key={`${dup}-${i}`}>
              {w}
              <span className="x"> / </span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
