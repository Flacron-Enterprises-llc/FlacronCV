import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppTourCard from './AppTourCard';

const labels = {
  title: 'Welcome to FlacronCV',
  body: 'This short tour shows the main areas.',
  progress: 'Step 1 of 8',
  backLabel: 'Back',
  skipLabel: 'Skip',
  nextLabel: 'Next',
  finishLabel: 'Finish',
  dialogLabel: 'App tour',
};

function renderCard(overrides: Partial<ComponentProps<typeof AppTourCard>> = {}) {
  const onBack = vi.fn();
  const onSkip = vi.fn();
  const onNext = vi.fn();
  render(
    <AppTourCard
      {...labels}
      isFirst
      isLast={false}
      busy={false}
      onBack={onBack}
      onSkip={onSkip}
      onNext={onNext}
      {...overrides}
    />,
  );
  return { onBack, onSkip, onNext };
}

describe('AppTourCard', () => {
  it('disables Back on the first step and shows Next', () => {
    const { onBack, onNext } = renderCard();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.getByText('Step 1 of 8')).toBeInTheDocument();
  });

  it('shows Finish on the last step and calls it from Next', async () => {
    const user = userEvent.setup();
    const { onNext } = renderCard({ isFirst: false, isLast: true, progress: 'Step 8 of 8' });
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('goes back, skips, and treats Escape as skip', async () => {
    const user = userEvent.setup();
    const { onBack, onSkip } = renderCard({ isFirst: false });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await user.keyboard('{Escape}');
    expect(onBack).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledTimes(2);
  });
});
