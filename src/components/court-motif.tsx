/**
 * A badminton court, drawn in painted lines.
 *
 * The whole product is about securing one of these, so the landing page draws
 * the thing itself rather than reaching for stock illustration. It is inert
 * decoration — hidden from assistive tech, and it never intercepts a tap.
 */
export function CourtMotif({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 610 1340"
      className={className}
      fill="none"
      aria-hidden
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <g
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="square"
        vectorEffect="non-scaling-stroke"
      >
        {/* Outer doubles boundary */}
        <rect x="2" y="2" width="606" height="1336" />
        {/* Singles side lines */}
        <line x1="46" y1="2" x2="46" y2="1338" />
        <line x1="564" y1="2" x2="564" y2="1338" />
        {/* Doubles long-service lines */}
        <line x1="2" y1="76" x2="608" y2="76" />
        <line x1="2" y1="1264" x2="608" y2="1264" />
        {/* Short-service lines */}
        <line x1="2" y1="472" x2="608" y2="472" />
        <line x1="2" y1="868" x2="608" y2="868" />
        {/* Centre line, broken at the net as it is on a real court */}
        <line x1="305" y1="2" x2="305" y2="472" />
        <line x1="305" y1="868" x2="305" y2="1338" />
        {/* Net */}
        <line x1="2" y1="670" x2="608" y2="670" strokeDasharray="10 9" opacity="0.75" />
      </g>
    </svg>
  );
}
