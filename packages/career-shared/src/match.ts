import { listingLabel } from './opportunities';

const DIMENSIONS = 32;

const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'was', 'were', 'will',
  'not', 'but', 'have', 'has', 'job', 'role', 'work', 'must', 'know', 'into', 'over', 'than', 'then',
  'them', 'they', 'our', 'out', 'all', 'any', 'can', 'its', 'who', 'what', 'when', 'where', 'which',
]);

export type MatchFit = 'blocked' | 'none' | 'partial' | 'strong';

export interface MatchLine {
  factId: string;
  text: string;
  confirmed: boolean;
}

export interface MatchListing {
  status: 'open' | 'closed';
  deadline: string | null;
  title: string;
  description: string;
  locations: string[];
  payKnown: boolean;
  sponsorship: 'unknown' | 'stated_yes' | 'stated_no';
}

export interface MatchReason {
  code: 'confirmed_overlap';
  factId: string;
  token: string;
}

export interface MatchGap {
  code: 'not_in_facts';
  token: string;
}

export interface MatchUnknown {
  code: 'pay' | 'sponsorship' | 'location' | 'unconfirmed';
  factId?: string;
  token?: string;
}

export interface MatchExplanation {
  fit: MatchFit;
  /** Cosine of the fake embeddings. Not a hiring probability and not an employer score. */
  overlap: number;
  reasons: MatchReason[];
  gaps: MatchGap[];
  unknowns: MatchUnknown[];
}

/** Deterministic stand-in for an embedding model. The same words always land in the same buckets. */
export function fakeEmbedding(text: string): number[] {
  const vector = Array.from({ length: DIMENSIONS }, () => 0);
  for (const token of tokens(text)) {
    let hash = 0;
    for (const char of token) hash = (Math.imul(hash, 33) + char.charCodeAt(0)) >>> 0;
    const bucket = hash % DIMENSIONS;
    vector[bucket] = (vector[bucket] ?? 0) + 1;
  }
  return vector;
}

export function cosine(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

/**
 * Explain one listing against one resume. Expired listings are blocked.
 * A word only on a draft fact stays unknown. Nothing here is a hire chance.
 */
export function explainMatch(listing: MatchListing, lines: MatchLine[], today: string): MatchExplanation {
  const listingTokens = tokens(`${listing.title} ${listing.description}`);
  const confirmed = new Set<string>();
  const reasons: MatchReason[] = [];
  const unknowns: MatchUnknown[] = [];
  for (const line of lines) {
    const words = tokens(line.text);
    if (line.confirmed) {
      for (const word of words) confirmed.add(word);
    }
    for (const word of words) {
      if (!listingTokens.includes(word)) continue;
      if (line.confirmed) {
        if (reasons.length < 8 && !reasons.some((reason) => reason.factId === line.factId && reason.token === word)) {
          reasons.push({ code: 'confirmed_overlap', factId: line.factId, token: word });
        }
      } else if (unknowns.length < 8 && !unknowns.some((item) => item.code === 'unconfirmed' && item.factId === line.factId && item.token === word)) {
        unknowns.push({ code: 'unconfirmed', factId: line.factId, token: word });
      }
    }
  }
  const gaps: MatchGap[] = [];
  for (const token of listingTokens) {
    if (confirmed.has(token)) continue;
    if (lines.some((line) => !line.confirmed && tokens(line.text).includes(token))) continue;
    if (gaps.some((gap) => gap.token === token)) continue;
    gaps.push({ code: 'not_in_facts', token });
    if (gaps.length >= 8) break;
  }
  if (!listing.payKnown) unknowns.push({ code: 'pay' });
  if (listing.sponsorship === 'unknown') unknowns.push({ code: 'sponsorship' });
  if (listing.locations.length === 0) unknowns.push({ code: 'location' });

  const confirmedText = lines
    .filter((line) => line.confirmed)
    .map((line) => line.text)
    .join(' ');
  const overlap = round(cosine(fakeEmbedding(confirmedText), fakeEmbedding(`${listing.title} ${listing.description}`)));
  const expired = listingLabel(listing.status, listing.deadline, today) === 'expired';
  const fit: MatchFit = expired ? 'blocked' : overlap === 0 ? 'none' : overlap < 0.35 ? 'partial' : 'strong';
  return { fit, overlap, reasons, gaps, unknowns };
}

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => token.length >= 3 && !STOP.has(token));
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
