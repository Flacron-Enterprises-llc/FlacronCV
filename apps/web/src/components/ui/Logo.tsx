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
 * Horizontal brand lockups (1712×265, ~6.5:1), same dimensions in both themes
 * so light/dark swap does not shift layout. Named for the INK, not the
 * background — the original `flacronCvlight` / `flacronCvblack` names described
 * their *backdrop*, which inverted the mapping before.
 *   • `logo-ink-dark`  = navy + orange artwork → use on LIGHT surfaces
 *   • `logo-ink-light` = white + orange artwork → use on DARK surfaces
 */
const ON_LIGHT = { src: '/logo-ink-dark.png', width: 1712, height: 265 } as const;
const ON_DARK = { src: '/logo-ink-light.png', width: 1712, height: 265 } as const;

/**
 * Official brand logo — theme-aware via CSS only (no JS, so no theme flash).
 * `next/image` optimises and resizes the source assets per render. Size with
 * height utilities (`h-*`) and `w-auto` so the horizontal lockup keeps aspect.
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
