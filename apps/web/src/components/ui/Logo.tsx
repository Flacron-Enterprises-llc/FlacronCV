import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
  /** Height utility (e.g. "h-8"); width auto-scales to the asset's aspect ratio. */
  className?: string;
  priority?: boolean;
  /**
   * Which surface the logo sits on. 'auto' (default) follows the theme.
   * Use 'on-dark' for a permanently dark surface (e.g. the auth brand panel)
   * and 'on-light' for a permanently light one.
   */
  variant?: 'auto' | 'on-light' | 'on-dark';
}

/**
 * These are derived from the supplied brand PNGs: background removed, empty
 * margins trimmed, and both exported at the SAME dimensions so the logo renders
 * identically in either theme.
 *
 * Named for the INK, not the background — the original `flacronCvlight` /
 * `flacronCvblack` names describe their *backdrop*, which is what caused the
 * light/dark mapping to be inverted before.
 *   • `logo-ink-dark`  = navy + orange artwork → use on LIGHT surfaces
 *   • `logo-ink-light` = white + orange artwork → use on DARK surfaces
 */
const ON_LIGHT = { src: '/logo-ink-dark.png', width: 1070, height: 807 } as const;
const ON_DARK = { src: '/logo-ink-light.png', width: 1070, height: 807 } as const;

/**
 * Official brand logo — theme-aware via CSS only (no JS, so no theme flash).
 * `next/image` optimises and resizes the source assets per render.
 *
 * Note: the lockup is the full stacked mark (monogram + wordmark + two tagline
 * lines), so at small heights the taglines become unreadable. A dedicated
 * horizontal header lockup from the brand owner would render better in the
 * 64px navbar.
 */
export default function Logo({ className = 'h-9', priority = false, variant = 'auto' }: LogoProps) {
  const base = cn('w-auto select-none', className);

  if (variant === 'on-light') {
    return (
      <Image
        src={ON_LIGHT.src}
        alt="FlacronCV"
        width={ON_LIGHT.width}
        height={ON_LIGHT.height}
        priority={priority}
        className={base}
      />
    );
  }

  if (variant === 'on-dark') {
    return (
      <Image
        src={ON_DARK.src}
        alt="FlacronCV"
        width={ON_DARK.width}
        height={ON_DARK.height}
        priority={priority}
        className={base}
      />
    );
  }

  return (
    <>
      <Image
        src={ON_LIGHT.src}
        alt="FlacronCV"
        width={ON_LIGHT.width}
        height={ON_LIGHT.height}
        priority={priority}
        className={cn(base, 'block dark:hidden')}
      />
      <Image
        src={ON_DARK.src}
        alt="FlacronCV"
        width={ON_DARK.width}
        height={ON_DARK.height}
        priority={priority}
        className={cn(base, 'hidden dark:block')}
      />
    </>
  );
}
