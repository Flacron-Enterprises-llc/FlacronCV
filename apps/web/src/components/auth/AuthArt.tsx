/**
 * Decorative brand artwork for the sign-in / sign-up pages (same shapes as the
 * mobile app): navy + orange curves and a stack of CV sheets with a done
 * badge. Pure SVG, aria-hidden, no client JS.
 */

const NAVY = '#10294f';
const ORANGE = '#ea580c';

/** Navy band with an orange crescent — top of the page on phones. */
export function AuthTopWave({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 390 92" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 74C120 40 270 26 390 34V64C292 50 150 60 0 92Z" fill={ORANGE} />
      <path d="M0 0H390V40C282 30 132 44 0 82Z" fill={NAVY} />
    </svg>
  );
}

/** Closing curve — bottom of the page on phones. */
export function AuthBottomWave({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 390 72" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 64C140 60 268 38 390 4V72H0Z" fill={ORANGE} />
      <path d="M0 72C150 70 282 50 390 22V72Z" fill={NAVY} />
    </svg>
  );
}

/** Orange crescent along the bottom edge of the desktop brand panel (below all text). */
export function PanelSwoosh({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 96C180 60 380 44 600 52V120H0Z" fill={ORANGE} />
      <path d="M0 120C190 86 390 72 600 78V120Z" fill="#0b1d3a" />
    </svg>
  );
}

/** Fine light arcs in the top corner of the desktop brand panel. */
export function PanelArcs({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 300" fill="none" aria-hidden="true" focusable="false">
      <circle cx="300" cy="0" r="120" stroke="#ffffff" strokeOpacity="0.08" />
      <circle cx="300" cy="0" r="180" stroke="#ffffff" strokeOpacity="0.06" />
      <circle cx="300" cy="0" r="240" stroke="#ffffff" strokeOpacity="0.04" />
    </svg>
  );
}

function Sheet({ x, y, w, h, rotate }: { x: number; y: number; w: number; h: number; rotate: number }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rows = [0.7, 0.55, 0.8, 0.5, 0.65, 0.45];
  return (
    <g transform={`rotate(${rotate} ${cx} ${cy})`}>
      <rect x={x + 2} y={y + 4} width={w} height={h} rx={10} fill={NAVY} opacity={0.12} />
      <rect x={x} y={y} width={w} height={h} rx={10} fill="#fff" stroke="#e7e5e4" />
      <path d={`M${x} ${y + 10}a10 10 0 0 1 10 -10h${w - 20}a10 10 0 0 1 10 10v8h-${w}z`} fill={NAVY} />
      <text x={x + 10} y={y + 13} fill="#fff" fontSize={9} fontWeight={700}>
        CV
      </text>
      {rows.map((r, i) => (
        <rect key={i} x={x + 10} y={y + 28 + i * 12} width={(w - 20) * r} height={4} rx={2} fill={i === 2 ? '#cbd5e1' : '#e2e8f0'} />
      ))}
    </g>
  );
}

/** CV sheets on a soft blob with a completed check. */
export function CvIllustration({ className, blob = '#ffedd5', glow = true }: { className?: string; blob?: string; glow?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 280 200" aria-hidden="true" focusable="false">
      <path d="M30 118C14 66 66 20 138 26C206 32 266 58 262 118C258 176 202 198 134 194C68 190 44 162 30 118Z" fill={blob} />
      {glow ? <circle cx={214} cy={38} r={24} fill="#fde68a" opacity={0.45} /> : null}
      <Sheet x={36} y={70} w={92} h={112} rotate={-11} />
      <Sheet x={160} y={62} w={88} h={108} rotate={9} />
      <rect x={89} y={35} width={116} height={150} rx={12} fill={NAVY} opacity={0.14} />
      <rect x={86} y={30} width={116} height={150} rx={12} fill="#fff" stroke="#e7e5e4" />
      <path d="M86 42a12 12 0 0 1 12 -12h92a12 12 0 0 1 12 12v18h-116z" fill={NAVY} />
      <text x={98} y={52} fill="#fff" fontSize={15} fontWeight={700}>
        CV
      </text>
      <rect x={126} y={41} width={56} height={4} rx={2} fill="#fff" opacity={0.6} />
      <rect x={126} y={49} width={38} height={4} rx={2} fill="#fff" opacity={0.35} />
      <circle cx={110} cy={82} r={13} fill="#e0e7ff" />
      <circle cx={110} cy={78} r={5} fill="#7c5a43" />
      <path d="M100 92c2-6 6-8 10-8s8 2 10 8z" fill={NAVY} />
      <rect x={130} y={74} width={58} height={5} rx={2.5} fill="#cbd5e1" />
      <rect x={130} y={84} width={44} height={4} rx={2} fill="#e2e8f0" />
      <rect x={98} y={104} width={50} height={5} rx={2.5} fill="#f97316" />
      <rect x={98} y={116} width={92} height={4} rx={2} fill="#e2e8f0" />
      <rect x={98} y={126} width={84} height={4} rx={2} fill="#e2e8f0" />
      <rect x={98} y={136} width={88} height={4} rx={2} fill="#e2e8f0" />
      <rect x={98} y={150} width={60} height={4} rx={2} fill="#e2e8f0" />
      <circle cx={200} cy={164} r={22} fill={ORANGE} stroke="#fff" strokeWidth={3} />
      <path d="M190 164l7 7 13-14" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
