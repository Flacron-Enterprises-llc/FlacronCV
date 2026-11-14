import {
  coverLetterPromptFacts,
  evaluateCoverLetter,
  keptGenerateFactIds,
  statedOrganization,
} from '@flacroncv/career-shared';
import type { ResumeFactInput } from '@flacroncv/career-shared';
import { completeWithin } from '../ai/text-model';
import type { TextModel } from '../ai/text-model';
import { BillingError } from '../billing/errors';
import { COVER_LETTER_SYSTEM, COVER_LETTER_TEMPLATE, parseCoverLetterReply } from './writing-compose';

export interface CoverLetterListing {
  title: string;
  organization: string;
  description: string;
}

export interface GeneratedCoverLetter {
  body: string;
  factIds: string[];
  provider: string;
  model: string;
}

/** Longest letter body either feature stores. */
export const MAX_LETTER_BODY = 20_000;

/**
 * The employer a letter may name: the stored organization when one was
 * stated, else a short leading line of the description that reads like a
 * name. Null when neither is safe to address.
 */
export function targetOrganizationName(listing: CoverLetterListing): string | null {
  const stored = statedOrganization(listing.organization);
  if (stored) return stored;
  const title = listing.title.trim().toLowerCase();
  const lines = listing.description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 2);
  for (const line of lines.slice(0, 5)) {
    if (line.toLowerCase() === title) continue;
    if (line.length > 120) continue;
    if (/^[A-Z]{2,}(?:[,\s-]+[A-Z]{2,})*$/.test(line)) continue;
    if (/\b(?:remote|hybrid|montreal|montréal|toronto|vancouver|qc|on|bc|canada)\b/i.test(line) && line.split(/\s+/).length <= 4) {
      continue;
    }
    if (/\b(?:must|required|responsibilities|qualifications|salary|apply|deadline|keep|help|work|know)\b/i.test(line)) continue;
    return line;
  }
  return null;
}

/**
 * One grounded cover letter from the text model: the model picks confirmed
 * facts and writes around them, and `evaluateCoverLetter` rejects any claim
 * the facts do not support. Every failure is `provider_unavailable`, so a
 * metered caller releases the credit instead of saving a weaker letter.
 * Used by the writing studio and by action packs, so both letters follow
 * the same rules.
 */
export async function generateCoverLetter(
  model: TextModel,
  facts: ResumeFactInput[],
  listing: CoverLetterListing | null,
): Promise<GeneratedCoverLetter> {
  const targetOrganization = listing ? targetOrganizationName(listing) : null;
  const prompt = JSON.stringify({
    type: 'cover_letter',
    requiredFactIds: keptGenerateFactIds(facts),
    facts: coverLetterPromptFacts(facts),
    listing: listing
      ? {
          title: listing.title,
          organization: targetOrganization,
          description: listing.description,
          role: 'target_employer',
        }
      : null,
  });
  const response = await completeWithin(model, {
    template: COVER_LETTER_TEMPLATE,
    system: COVER_LETTER_SYSTEM,
    prompt,
    maxTokens: 1200,
    temperature: 0,
  });
  const reply = parseCoverLetterReply(response.text);
  if (!reply) throw new BillingError('provider_unavailable', { reason: 'unusable_output' });
  const evaluated = evaluateCoverLetter(reply, facts, {
    listingOrganization: targetOrganization,
    listingTitle: listing?.title ?? null,
    listingDescription: listing?.description ?? null,
  });
  if (!evaluated.ok || evaluated.body.length > MAX_LETTER_BODY) {
    throw new BillingError('provider_unavailable', {
      reason: evaluated.ok ? 'unusable_output' : evaluated.reason,
      ...(!evaluated.ok && evaluated.claim ? { claim: evaluated.claim } : {}),
    });
  }
  return { body: evaluated.body, factIds: evaluated.factIds, provider: response.provider, model: response.model };
}

/** The confirmed contact name, used to sign a letter. Undefined when none is confirmed. */
export function confirmedFullName(facts: ResumeFactInput[]): string | undefined {
  for (const fact of facts) {
    if (fact.factType !== 'contact' || fact.confirmation !== 'confirmed') continue;
    const fullName = typeof fact.value.fullName === 'string' ? fact.value.fullName.trim() : '';
    if (fullName) return fullName;
  }
  return undefined;
}
