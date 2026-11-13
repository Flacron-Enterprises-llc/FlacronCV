import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ApiError, type ApiClient } from '@flacroncv/career-api-client';
import en from '../../../public/locales/en/common.json';
import { ContactSalesForm } from './ContactSalesForm';

vi.mock('@/components/career/CareerServices', () => ({ useCareerApi: () => ({}) }));

function renderForm(createSalesInquiry: ReturnType<typeof vi.fn>) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ContactSalesForm api={{ createSalesInquiry } as unknown as ApiClient} />
    </NextIntlClientProvider>,
  );
}

function fill(values: { name?: string; email?: string; organization?: string; message?: string }) {
  if (values.name !== undefined) fireEvent.change(screen.getByLabelText('Name'), { target: { value: values.name } });
  if (values.email !== undefined) fireEvent.change(screen.getByLabelText('Work email'), { target: { value: values.email } });
  if (values.organization !== undefined)
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: values.organization } });
  if (values.message !== undefined) fireEvent.change(screen.getByLabelText('What you need'), { target: { value: values.message } });
}

const valid = { name: 'Ada Lovelace', email: 'ada@example.test', organization: 'Careers office', message: 'We need 40 seats and SSO.' };

describe('ContactSalesForm (Business)', () => {
  it('refuses invalid input before calling the API, naming the first problem', async () => {
    const createSalesInquiry = vi.fn();
    renderForm(createSalesInquiry);
    fill({ ...valid, name: 'A' });
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }));
    expect(await screen.findByText('Enter a name of at least two characters.')).toBeTruthy();
    fill({ name: valid.name, email: 'no-at-sign' });
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }));
    expect(await screen.findByText('Enter an email address that includes @.')).toBeTruthy();
    fill({ email: valid.email, message: 'short' });
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }));
    expect(await screen.findByText('Enter a message of at least ten characters.')).toBeTruthy();
    expect(createSalesInquiry).not.toHaveBeenCalled();
  });

  it('submits the trimmed inquiry once and does not claim an email when none was sent', async () => {
    const createSalesInquiry = vi.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111', delivered: false }));
    renderForm(createSalesInquiry);
    fill({ ...valid, organization: '  Careers office  ' });
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }));
    expect(await screen.findByText('Saved. No email was sent.')).toBeTruthy();
    expect(screen.queryByText('Saved and emailed.')).toBeNull();
    expect(createSalesInquiry).toHaveBeenCalledTimes(1);
    expect(createSalesInquiry).toHaveBeenCalledWith(valid);
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
  });

  it('says so when the email was sent', async () => {
    renderForm(vi.fn(async () => ({ id: 'x', delivered: true })));
    fill(valid);
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }));
    expect(await screen.findByText('Saved and emailed.')).toBeTruthy();
  });

  it('explains a rate limit and a failure, and keeps what was typed', async () => {
    const createSalesInquiry = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(429, 'rate_limited', {} as never))
      .mockRejectedValueOnce(new Error('network'));
    renderForm(createSalesInquiry);
    fill(valid);
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }));
    expect(await screen.findByText('Too many inquiries from this network. Try later.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }));
    expect(await screen.findByText('The inquiry was not saved. Try again.')).toBeTruthy();
    await waitFor(() => expect(createSalesInquiry).toHaveBeenCalledTimes(2));
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(valid.name);
  });
});
