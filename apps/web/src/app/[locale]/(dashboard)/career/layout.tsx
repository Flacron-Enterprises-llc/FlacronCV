import { CareerNav } from '@/components/career/CareerNav';

/**
 * The career area (former V2 features) inside V1's dashboard shell, which
 * already handles sign-in and email verification redirects.
 */
export default function CareerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <CareerNav />
      {children}
    </div>
  );
}
