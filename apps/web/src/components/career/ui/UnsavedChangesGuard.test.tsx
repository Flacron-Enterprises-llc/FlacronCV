import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../public/locales/en/common.json';
import fr from '../../../../public/locales/fr/common.json';
import { confirmLeaveIfUnsaved, useUnsavedChangesGuard } from './UnsavedChangesGuard';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function Editor({ start = true }: { start?: boolean }) {
  const [dirty, setDirty] = useState(start);
  const guard = useUnsavedChangesGuard(dirty);
  return (
    <div>
      {guard.dialog}
      <a href="/en/jobs">Job Tracker</a>
      <a href="/en/career/documents#top">Same page</a>
      <button type="button" onClick={() => setDirty(false)}>
        Save
      </button>
      <button type="button" onClick={() => void guard.confirm().then((leave) => leave && push('switched'))}>
        Switch document
      </button>
    </div>
  );
}

function renderEditor(messages: Record<string, unknown> = en, locale = 'en', start = true) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <Editor start={start} />
    </NextIntlClientProvider>,
  );
}

describe('unsaved-changes guard for career editors', () => {
  beforeEach(() => {
    push.mockReset();
    window.history.replaceState(null, '', '/en/career/documents');
  });

  it('an internal link asks first; Stay keeps the page, Leave navigates once', async () => {
    renderEditor();
    fireEvent.click(screen.getByText('Job Tracker'));
    expect(screen.getByRole('dialog', { name: 'Leave without saving?' })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Stay on this page' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Job Tracker'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/en/jobs');
  });

  it('Escape means Stay, and the Stay button has focus for keyboard users', async () => {
    renderEditor();
    fireEvent.click(screen.getByText('Job Tracker'));
    const stay = screen.getByRole('button', { name: 'Stay on this page' });
    expect(document.activeElement === stay || screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it('switching documents and programmatic navigation ask once; a second request does not stack a dialog', async () => {
    renderEditor();
    fireEvent.click(screen.getByText('Switch document'));
    let second: boolean | undefined;
    await act(async () => {
      second = await confirmLeaveIfUnsaved();
    });
    expect(second).toBe(false);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));
    });
    expect(push).toHaveBeenCalledWith('switched');
  });

  it('browser Back asks first and keeps the page on Stay; Leave goes back past the held entry', async () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    renderEditor();
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stay on this page' }));
    expect(go).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));
    });
    expect(go).toHaveBeenCalledWith(-2);
    go.mockRestore();
  });

  it('after a successful save nothing is intercepted and in-page anchors are never intercepted', () => {
    renderEditor();
    fireEvent.click(screen.getByText('Same page'));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByText('Save'));
    fireEvent.click(screen.getByText('Job Tracker'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('speaks the page language', () => {
    renderEditor(fr, 'fr');
    fireEvent.click(screen.getByText('Job Tracker'));
    expect(screen.getByRole('dialog', { name: 'Quitter sans enregistrer ?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rester sur cette page' })).toBeTruthy();
  });
});
