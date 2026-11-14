import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderPricing } from './test-utils';
import { PriceCalculator } from './PriceCalculator';

const get = vi.fn();
vi.mock('@/lib/api', () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

const NOW = new Date('2026-11-14T12:00:00Z');

function setPlan(id: string) {
  fireEvent.change(screen.getByLabelText('Base plan'), { target: { value: id } });
}
function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
const total = (id: string) => screen.getByTestId(id).textContent;

describe('PriceCalculator (spec §10A/§10B examples)', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockRejectedValue(new Error('no /plans yet'));
  });

  it('reproduces Example A', () => {
    const { missing } = renderPricing(<PriceCalculator now={NOW} />);
    setPlan('professional');
    type('Extra location profiles', '1');
    type('Extra document credits', '30');
    type('Extra action packs', '5');
    type('Extra voice minutes', '60');
    expect(total('estimate-recurring')).toBe('$40.98');
    expect(total('estimate-one-time')).toBe('$30.97');
    expect(total('estimate-due-now')).toBe('$71.95');
    expect(missing).toEqual([]);
  });

  it('reproduces Example B', () => {
    renderPricing(<PriceCalculator now={NOW} />);
    setPlan('career_pro');
    type('Extra alert items', '500');
    type('Extra voice minutes', '180');
    expect(total('estimate-due-now')).toBe('$108.97');
    expect(total('estimate-recurring')).toBe('$68.99');
  });

  it('reproduces Example C', () => {
    renderPricing(<PriceCalculator now={NOW} />);
    setPlan('business');
    type('Extra staff seats', '2');
    type('Blocks of 25 active candidates', '1');
    type('Extra storage (100 GB blocks)', '1');
    type('Extra document credits', '100');
    expect(total('estimate-recurring')).toBe('$304.99');
    expect(total('estimate-due-now')).toBe('$339.98');
  });

  it('reproduces Example D with the base monthly equivalent shown separately', () => {
    renderPricing(<PriceCalculator now={NOW} initialInterval="annual" />);
    setPlan('professional');
    type('Extra location profiles', '1');
    type('Extra document credits', '30');
    type('Extra action packs', '5');
    type('Extra voice minutes', '60');
    expect(total('estimate-due-now')).toBe('$422.86');
    expect(total('estimate-recurring')).toBe('$1.99');
    expect(total('estimate-equivalent')).toBe('$32.49/month');
    expect(screen.getByText(/renews yearly at the then-disclosed price; next renewal November 14, 2027/)).toBeTruthy();
  });

  it('buys one 30-pack and one 10-pack for 40 documents ($17.98) and shows the units bought', () => {
    renderPricing(<PriceCalculator now={NOW} />);
    setPlan('starter');
    type('Extra document credits', '40');
    expect(total('estimate-one-time')).toBe('$17.98');
    expect(within(screen.getByTestId('estimate-line-document_m')).getByText(/30 units bought/)).toBeTruthy();
    expect(within(screen.getByTestId('estimate-line-document_s')).getByText(/10 units bought/)).toBeTruthy();
    expect(screen.getByTestId('estimate-units-documents').textContent).toContain('20 included + 40 purchased');
    expect(screen.getByText('Packs bought today expire on November 14, 2027.')).toBeTruthy();
  });

  it('disables incompatible items with the plan they need, and Free stays $0', () => {
    renderPricing(<PriceCalculator now={NOW} />);
    setPlan('starter');
    expect((screen.getByLabelText('Extra action packs') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByText('Needs Professional or above').length).toBeGreaterThan(0);
    setPlan('free');
    expect((screen.getByLabelText('Extra document credits') as HTMLInputElement).disabled).toBe(true);
    expect(total('estimate-due-now')).toBe('$0');
    expect(screen.getByText(/Paid add-ons cannot be bought on Free/)).toBeTruthy();
  });

  it('marks lines that are not on sale yet and copies an itemized estimate', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPricing(<PriceCalculator now={NOW} />);
    setPlan('professional');
    type('Extra document credits', '30');
    expect(within(screen.getByTestId('estimate')).getAllByText('Not on sale yet').length).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Copy estimate' }));
    await screen.findByRole('button', { name: 'Estimate copied' });
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain('Base plan: Professional');
    expect(text).toContain('Document Pack M × 1 @ $12.99 = $12.99');
    expect(text).toContain('Estimated amount due now: $51.98');
    expect(text).toContain('Currency: USD');
    expect(text).toContain('Estimate date: 2026-11-14');
    expect(text).toContain('Catalog version: 2026-10-10');
  });

  it('ignores input that is not a whole number up to 10,000', () => {
    renderPricing(<PriceCalculator now={NOW} />);
    type('Extra document credits', '12a');
    expect((screen.getByLabelText('Extra document credits') as HTMLInputElement).value).toBe('');
    type('Extra document credits', '99999');
    expect((screen.getByLabelText('Extra document credits') as HTMLInputElement).value).toBe('');
  });
});
