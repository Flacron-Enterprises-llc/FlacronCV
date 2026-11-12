import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type AlertLocation } from '@flacroncv/career-api-client';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { AlertTargets, parseRadius } from './AlertTargets';

const leeds: AlertLocation = { id: 'loc-1', place: 'Leeds', radiusMiles: 25 };

function renderTargets(api = testApi(), onLocations = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <AlertTargets api={api} onLocations={onLocations} />
    </NextIntlClientProvider>,
  );
  return onLocations;
}

describe('parseRadius', () => {
  it('accepts whole miles up to 10000 and treats empty as the default', () => {
    expect(parseRadius('')).toBeUndefined();
    expect(parseRadius(' 25 ')).toBe(25);
    expect(parseRadius('10000')).toBe(10000);
    expect(parseRadius('10001')).toBe('invalid');
    expect(parseRadius('2.5')).toBe('invalid');
    expect(parseRadius('-3')).toBe('invalid');
  });
});

describe('AlertTargets', () => {
  it('lists places and companies and passes the places to the search form', async () => {
    const api = testApi({
      alertLocations: vi.fn().mockResolvedValue({ items: [leeds] }),
      followedCompanies: vi.fn().mockResolvedValue({ items: [{ id: 'co-1', name: 'Northwind Studio', sourceUrl: null }] }),
    });
    const onLocations = renderTargets(api);
    expect(await screen.findByText('Leeds · within 25 miles')).toBeTruthy();
    expect(await screen.findByText('Northwind Studio')).toBeTruthy();
    expect(onLocations).toHaveBeenCalledWith([leeds]);
  });

  it('saves a place with its radius and refuses an invalid radius without calling the API', async () => {
    const createAlertLocation = vi.fn().mockResolvedValue(leeds);
    const alertLocations = vi.fn().mockResolvedValueOnce({ items: [] }).mockResolvedValue({ items: [leeds] });
    const api = testApi({ alertLocations, createAlertLocation, followedCompanies: vi.fn().mockResolvedValue({ items: [] }) });
    renderTargets(api);
    expect(await screen.findByText('No places saved yet.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Town, city or region'), { target: { value: 'Leeds' } });
    fireEvent.change(screen.getByLabelText('Distance in miles'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save place' }));
    expect(await screen.findByText('Check the details and try again.')).toBeTruthy();
    expect(createAlertLocation).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Distance in miles'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save place' }));
    await waitFor(() => expect(createAlertLocation).toHaveBeenCalledWith({ place: 'Leeds', radiusMiles: 25 }));
    expect(await screen.findByText('Leeds · within 25 miles')).toBeTruthy();
  });

  it('follows and unfollows a company, and reports the plan capacity', async () => {
    const followCompany = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(403, 'capacity_exceeded', { code: 'capacity_exceeded' }))
      .mockResolvedValue({ id: 'co-2', name: 'Babbage Works', sourceUrl: null });
    const followedCompanies = vi
      .fn()
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValue({ items: [{ id: 'co-2', name: 'Babbage Works', sourceUrl: null }] });
    const unfollowCompany = vi.fn().mockResolvedValue({ ok: true });
    renderTargets(testApi({ alertLocations: vi.fn().mockResolvedValue({ items: [] }), followedCompanies, followCompany, unfollowCompany }));
    expect(await screen.findByText('You are not following any companies yet.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Babbage Works' } });
    fireEvent.click(screen.getByRole('button', { name: 'Follow company' }));
    expect(await screen.findByText(messages.career.alerts.capacity)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Follow company' }));
    await waitFor(() => expect(followCompany).toHaveBeenLastCalledWith({ name: 'Babbage Works' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop following Babbage Works' }));
    await waitFor(() => expect(unfollowCompany).toHaveBeenCalledWith('co-2'));
    expect(await screen.findByText('You are not following any companies yet.')).toBeTruthy();
  });

  it('keeps one list usable when the other fails to load', async () => {
    renderTargets(
      testApi({
        alertLocations: vi.fn().mockRejectedValue(new Error('down')),
        followedCompanies: vi.fn().mockResolvedValue({ items: [{ id: 'co-1', name: 'Northwind Studio', sourceUrl: null }] }),
      }),
    );
    expect(await screen.findByText('Could not load your places.')).toBeTruthy();
    expect(await screen.findByText('Northwind Studio')).toBeTruthy();
  });
});
