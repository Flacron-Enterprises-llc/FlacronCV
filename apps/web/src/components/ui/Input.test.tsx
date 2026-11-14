import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import Input from './Input';

describe('Input', () => {
  it('links the label to the field even when no id is passed', () => {
    render(<Input label="First name" />);
    // getByLabelText only succeeds when <label for> points at the input.
    const input = screen.getByLabelText('First name');
    expect(input.tagName).toBe('INPUT');
    expect(input.id).toBeTruthy();
  });

  it('keeps an explicit id', () => {
    render(<Input id="cv-email" label="Email" />);
    expect(screen.getByLabelText('Email').id).toBe('cv-email');
  });

  it('describes the field by its error and marks it invalid', () => {
    render(<Input label="Email" error="Invalid email" hint="We never share it" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Invalid email');
  });

  it('describes the field by its hint when there is no error, keeping a caller description', () => {
    render(
      <>
        <span id="extra">Extra help</span>
        <Input label="Title" hint="Shown on your dashboard" aria-describedby="extra" />
      </>,
    );
    const input = screen.getByLabelText('Title');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).toHaveAccessibleDescription('Shown on your dashboard Extra help');
  });
});
