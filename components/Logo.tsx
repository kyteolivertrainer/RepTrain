export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {/* ascending progress bars — reps stacking up into a streak */}
      <rect x="3" y="20" width="6" height="9" rx="3" fill="var(--volt)" opacity="0.55" />
      <rect x="13" y="14" width="6" height="15" rx="3" fill="var(--volt)" opacity="0.8" />
      <rect x="23" y="5" width="6" height="24" rx="3" fill="var(--volt)" />
      {/* ember tip on the tallest bar — the streak is alight */}
      <circle cx="26" cy="5" r="3" fill="var(--ember)" />
    </svg>
  );
}
