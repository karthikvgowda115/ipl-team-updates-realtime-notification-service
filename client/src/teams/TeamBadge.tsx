import { teamColors } from './teamColors';

export default function TeamBadge({ short, size = 48 }: { short: string; size?: number }) {
  const { bg, fg } = teamColors(short);
  return (
    <span
      className="team-badge"
      style={{ background: bg, color: fg, width: size, height: size, fontSize: size * (short.length > 3 ? 0.26 : 0.32) }}
      aria-hidden="true"
    >
      {short}
    </span>
  );
}
