import { coverLetterPromptFacts, evaluateProse } from '@flacroncv/career-shared';
import type { ProseWritingType, ResumeFactInput, WritingContext } from '@flacroncv/career-shared';
import { completeWithin } from '../ai/text-model';
import type { TextModel } from '../ai/text-model';
import { BillingError } from '../billing/errors';
import { WRITING_PROSE_SYSTEM, WRITING_PROSE_TEMPLATE, parseProseReply } from './writing-compose';

export interface ProseListing {
  title: string;
  /** The organization a draft may address (already resolved by `targetOrganizationName`). */
  organization: string | null;
  description: string;
}

export interface GeneratedProse {
  body: string;
  factIds: string[];
  provider: string;
  model: string;
}

/**
 * One prose draft from the text model, held to the same claim rules as a
 * cover letter (`evaluateProse`). Every failure is `provider_unavailable`
 * so the metered caller releases the credit instead of saving a weaker
 * draft. The listing's own organization wins over a typed one; typed
 * context fills in what the listing does not say.
 */
export async function generateProse(
  model: TextModel,
  type: ProseWritingType,
  facts: ResumeFactInput[],
  listing: ProseListing | null,
  context: WritingContext,
  language: string,
): Promise<GeneratedProse> {
  const organization = listing?.organization ?? context.organization ?? null;
  const role = context.role ?? listing?.title ?? null;
  const target = {
    organization,
    role,
    contactName: context.contactName ?? null,
    contactRole: context.contactRole ?? null,
    interviewDate: type === 'thank_you' ? (context.interviewDate ?? null) : null,
  };
  const prompt = JSON.stringify({
    type,
    language,
    facts: coverLetterPromptFacts(facts),
    target: organization || role || target.contactName ? target : null,
    listing: listing ? { title: listing.title, description: listing.description } : null,
  });
  const response = await completeWithin(model, {
    template: WRITING_PROSE_TEMPLATE,
    system: WRITING_PROSE_SYSTEM,
    prompt,
    maxTokens: 900,
    temperature: 0,
  });
  const reply = parseProseReply(response.text);
  if (!reply) throw new BillingError('provider_unavailable', { reason: 'unusable_output' });
  const evaluated = evaluateProse(type, reply, facts, {
    ...target,
    listingTitle: listing?.title ?? null,
    listingDescription: listing?.description ?? null,
  });
  if (!evaluated.ok) {
    throw new BillingError('provider_unavailable', {
      reason: evaluated.reason,
      ...(evaluated.claim ? { claim: evaluated.claim } : {}),
    });
  }
  return { body: evaluated.body, factIds: evaluated.factIds, provider: response.provider, model: response.model };
}
