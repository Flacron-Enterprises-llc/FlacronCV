import { describe, expect, it } from 'vitest';
import {
  coverLetterPromptFacts,
  employerMentions,
  employmentTenure,
  evaluateCoverLetter,
  evaluateProse,
  normalizeWritingContext,
  proseReady,
  salutationNames,
  isCoverLetterTemplateId,
  writingBody,
  writingTitle,
} from './writing';
import type { ResumeFactInput } from './resume';

function fact(partial: Partial<ResumeFactInput> & Pick<ResumeFactInput, 'id' | 'factType' | 'value'>): ResumeFactInput {
  return {
    confirmation: 'confirmed',
    uncertain: {},
    ...partial,
  };
}

describe('writingBody', () => {
  const skill = fact({ id: 's1', factType: 'skill', value: { name: 'SQL' } });
  const draft = fact({
    id: 'e1',
    factType: 'experience',
    value: { position: 'Analyst', company: 'SecretCo' },
    confirmation: 'draft',
  });
  const achievement = fact({
    id: 'a1',
    factType: 'achievement',
    value: { statement: 'Kept the ledger' },
  });

  it('uses confirmed fact text and drops a draft, an unknown id, and a sentence that is not a fact', () => {
    const draftText = writingBody([skill, draft, achievement], ['missing', 'e1', 'a1', 's1']);
    expect(draftText.body).toBe('Kept the ledger\n\nSQL');
    expect(draftText.factIds).toEqual(['a1', 's1']);
    expect(draftText.body).not.toContain('SecretCo');
    expect(draftText.body).not.toContain('50');
  });

  it('does not invent a number when the achievement has no metric', () => {
    expect(writingBody([achievement]).body).toBe('Kept the ledger');
  });

  it('names the listing organization in the title only', () => {
    expect(writingTitle('cover_letter', 'Babbage')).toBe('Cover letter for Babbage');
    expect(writingTitle('outreach', null)).toBe('Outreach');
    expect(writingTitle('bio', 'Babbage')).toBe('Bio');
  });

  it('rejects a short cover letter and keeps a letter that names the employer', () => {
    const role = fact({
      id: 'e2',
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northwind Cataloguing' },
    });
    const short = evaluateCoverLetter(
      { opening: 'Hello', body: 'SQL', closing: 'Thanks', factIds: [role.id, skill.id] },
      [role, skill],
    );
    expect(short).toEqual({ ok: false, reason: 'incomplete_opening' });
    const usable = evaluateCoverLetter(
      {
        opening: 'I am writing to apply and to share the work I did at Northwind Cataloguing.',
        body: 'At Northwind Cataloguing I worked as a cataloguer and used SQL every week to keep inventory records accurate for the team. That confirmed experience is the evidence I can offer.',
        closing: 'Thank you for your time and consideration.',
        factIds: [skill.id],
      },
      [role, skill],
    );
    expect(usable.ok).toBe(true);
    if (!usable.ok) return;
    expect(usable.body.split('\n\n')).toHaveLength(3);
    expect(usable.body).toContain('Northwind Cataloguing');
    expect(usable.body.length).toBeGreaterThan(200);
    expect(usable.factIds).toEqual(expect.arrayContaining([role.id, skill.id]));
  });

  it('treats an end date as ended work even if current is still true', () => {
    expect(employmentTenure({ current: true, endDate: '2024-06' })).toBe('ended');
    expect(employmentTenure({ current: true })).toBe('current');
    expect(employmentTenure({ position: 'Cataloguer' })).toBe('undated');
  });

  it('sends structured tenure so missing dates are not current', () => {
    const ended = fact({
      id: 'e2',
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northbridge Civic Library', startDate: '2021-01', endDate: '2024-06', current: true },
    });
    const prompted = coverLetterPromptFacts([ended]);
    expect(prompted[0]).toMatchObject({
      company: 'Northbridge Civic Library',
      startDate: '2021-01',
      endDate: '2024-06',
      current: false,
      tenure: 'ended',
    });
  });

  it('rejects current-language for an ended role and allows it for confirmed current work', () => {
    const ended = fact({
      id: 'e2',
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northbridge Civic Library', startDate: '2021-01', endDate: '2024-06' },
    });
    const skill = fact({ id: 's1', factType: 'skill', value: { name: 'SQL' } });
    const currentClaim = evaluateCoverLetter(
      {
        opening: 'I am writing to apply and to share my cataloguing work with your team.',
        body: 'Currently I work at Northbridge Civic Library as a cataloguer and used SQL every week to keep inventory records accurate for the team. That confirmed experience is the evidence I can offer.',
        closing: 'Thank you for your time and consideration.',
        factIds: [ended.id, skill.id],
      },
      [ended, skill],
    );
    expect(currentClaim).toEqual({ ok: false, reason: 'current_role_unsupported' });

    const current = fact({
      id: 'e3',
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northbridge Civic Library', startDate: '2021-01', current: true },
    });
    const allowed = evaluateCoverLetter(
      {
        opening: 'I am writing to apply and to share my cataloguing work with your team.',
        body: 'Currently I work at Northbridge Civic Library as a cataloguer and use SQL every week to keep inventory records accurate for the team. That confirmed experience is the evidence I can offer.',
        closing: 'Thank you for your time and consideration.',
        factIds: [current.id, skill.id],
      },
      [current, skill],
    );
    expect(allowed.ok).toBe(true);
  });

  it('does not treat unknown dates as current employment', () => {
    const undated = fact({
      id: 'e4',
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northbridge Civic Library' },
    });
    const skill = fact({ id: 's1', factType: 'skill', value: { name: 'SQL' } });
    const claimed = evaluateCoverLetter(
      {
        opening: 'Je vous écris pour poser ma candidature et parler de mon travail de catalogage.',
        body: "Actuellement je travaille chez Northbridge Civic Library comme catalogueur et j'utilise SQL chaque semaine pour tenir l'inventaire de l'équipe. Cette expérience confirmée est la preuve que je peux offrir.",
        closing: 'Je vous remercie de votre temps et de votre attention.',
        factIds: [undated.id, skill.id],
      },
      [undated, skill],
    );
    expect(claimed).toEqual({ ok: false, reason: 'current_role_unsupported' });
  });

  it('keeps the target employer separate from past employers', () => {
    const past = fact({
      id: 'e5',
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northbridge Civic Library', startDate: '2021-01', endDate: '2024-06' },
    });
    const skill = fact({ id: 's1', factType: 'skill', value: { name: 'SQL' } });
    const mixed = evaluateCoverLetter(
      {
        opening: 'I am writing to apply and to share the work I did at Northbridge Civic Library.',
        body: 'At Harbourfront Learning Room I worked as a cataloguer and used SQL every week to keep inventory records accurate for the team. That confirmed experience is the evidence I can offer.',
        closing: 'Thank you for your time and consideration.',
        factIds: [past.id, skill.id],
      },
      [past, skill],
      { listingOrganization: 'Harbourfront Learning Room' },
    );
    expect(mixed).toEqual({ ok: false, reason: 'target_as_past_employer' });

    const pastedAsPast = evaluateCoverLetter(
      {
        opening: 'I am writing to apply and to share the work I did at Northbridge Civic Library.',
        body: 'At Harbourfront Learning Room I worked as a cataloguer and used SQL every week to keep inventory records accurate for the team. That confirmed experience is the evidence I can offer.',
        closing: 'Thank you for your time and consideration.',
        factIds: [past.id, skill.id],
      },
      [past, skill],
      {
        listingOrganization: 'unstated',
        listingTitle: 'Cataloguing Coordinator',
        listingDescription: 'Harbourfront Learning Room\nKeep records accurate.',
      },
    );
    expect(pastedAsPast).toEqual({ ok: false, reason: 'target_as_past_employer' });

    const targeted = evaluateCoverLetter(
      {
        opening: 'I am writing to apply to Harbourfront Learning Room and to share cataloguing work from Northbridge Civic Library.',
        body: 'At Northbridge Civic Library I worked as a cataloguer from 2021-01 to 2024-06 and used SQL every week to keep inventory records accurate for the team. That confirmed experience is the evidence I can offer.',
        closing: 'Thank you for your time and consideration.',
        factIds: [past.id, skill.id],
      },
      [past, skill],
      { listingOrganization: 'Harbourfront Learning Room' },
    );
    expect(targeted.ok).toBe(true);

    const pasted = evaluateCoverLetter(
      {
        opening: 'I am writing to apply to Harbourfront Learning Room and to share cataloguing work from Northbridge Civic Library.',
        body: 'At Northbridge Civic Library I worked as a cataloguer from 2021-01 to 2024-06 and used SQL every week to keep inventory records accurate for the team. That confirmed experience is the evidence I can offer.',
        closing: 'Thank you for your time and consideration.',
        factIds: [past.id, skill.id],
      },
      [past, skill],
      {
        listingOrganization: 'unstated',
        listingTitle: 'Cataloguing Coordinator',
        listingDescription: 'Harbourfront Learning Room\nKeep records accurate.',
      },
    );
    expect(pasted.ok).toBe(true);

    const possessiveTarget = evaluateCoverLetter(
      {
        opening: "I am writing to apply for Harbourfront's Learning Room role and to share cataloguing work from Northbridge Civic Library.",
        body: 'At Northbridge Civic Library I worked as a cataloguer from 2021-01 to 2024-06 and used SQL every week to keep inventory records accurate for the team. That confirmed experience is the evidence I can offer.',
        closing: 'Thank you for your time and consideration.',
        factIds: [past.id, skill.id],
      },
      [past, skill],
      {
        listingOrganization: 'unstated',
        listingTitle: 'Cataloguing Coordinator',
        listingDescription: 'Harbourfront Learning Room\nKeep records accurate.',
      },
    );
    expect(possessiveTarget.ok).toBe(true);

    const targetAsExperience = evaluateCoverLetter(
      {
        opening: 'I am writing to apply and to share the work I did at Northbridge Civic Library.',
        body: 'Chez Harbourfront Learning Room, j’ai travaillé comme catalogueur et utilisé SQL chaque semaine pour tenir les dossiers exacts pour l’équipe.',
        closing: 'Je vous remercie de votre temps et de votre attention.',
        factIds: [past.id, skill.id],
      },
      [past, skill],
      { listingOrganization: 'Harbourfront Learning Room' },
    );
    expect(targetAsExperience).toEqual({ ok: false, reason: 'target_as_past_employer' });
  });

  it('extracts an at-mention on its own line', () => {
    expect(
      employerMentions(
        'I am writing to apply and to share the work I did at Northbridge Civic Library.\n\nAt Northwind Cataloguing I worked as a cataloguer.',
      ),
    ).toEqual(['Northbridge Civic Library', 'Northwind Cataloguing']);
  });

  it('does not turn ordinary at-phrases into unsupported employers', () => {
    const past = fact({
      id: 'e6b',
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northbridge Civic Library', startDate: '2021-01', endDate: '2024-06' },
    });
    const skill = fact({ id: 's1b', factType: 'skill', value: { name: 'SQL' } });
    const result = evaluateCoverLetter(
      {
        opening: 'I am writing to apply to Harbourfront Learning Room and to share cataloguing work from Northbridge Civic Library.',
        body: 'At Northbridge Civic Library I worked as a cataloguer from 2021-01 to 2024-06 and used SQL at scale for accurate records. I also helped neighbours at the desk with patient service.',
        closing: 'Thank you for your time and consideration.',
        factIds: [past.id, skill.id],
      },
      [past, skill],
      { listingOrganization: 'Harbourfront Learning Room' },
    );
    expect(result.ok).toBe(true);
  });

  it('rejects an unsupported employer or invented year', () => {
    const past = fact({
      id: 'e6',
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northbridge Civic Library', startDate: '2021-01', endDate: '2024-06' },
    });
    const skill = fact({ id: 's1', factType: 'skill', value: { name: 'SQL' } });
    const swapped = evaluateCoverLetter(
      {
        opening: 'I am writing to apply and to share the work I did at Northbridge Civic Library.',
        body: 'At Northwind Cataloguing I worked as a cataloguer and used SQL every week to keep inventory records accurate for the team. That confirmed experience is the evidence I can offer.',
        closing: 'Thank you for your time and consideration.',
        factIds: [past.id, skill.id],
      },
      [past, skill],
    );
    expect(swapped).toEqual({ ok: false, reason: 'unsupported_employer', claim: 'Northwind Cataloguing' });

    const inventedYear = evaluateCoverLetter(
      {
        opening: 'I am writing to apply and to share the work I did at Northbridge Civic Library.',
        body: 'At Northbridge Civic Library I worked as a cataloguer from 2018 until 2024-06 and used SQL every week to keep inventory records accurate for the team.',
        closing: 'Thank you for your time and consideration.',
        factIds: [past.id, skill.id],
      },
      [past, skill],
    );
    expect(inventedYear).toEqual({ ok: false, reason: 'unsupported_date' });

    const anglicizedSchool = evaluateCoverLetter(
      {
        opening: 'I am writing to apply and to share the work I did at Northbridge Civic Library.',
        body: 'At the University of Montreal I studied cataloguing and used SQL every week to keep inventory records accurate for the team. That confirmed education is the evidence I can offer.',
        closing: 'Thank you for your time and consideration.',
        factIds: [past.id, skill.id],
      },
      [
        past,
        skill,
        fact({
          id: 'ed1',
          factType: 'education',
          value: { institution: 'Universite de Montreal', degree: 'Bachelor' },
        }),
      ],
    );
    expect(anglicizedSchool.ok).toBe(true);
  });

  it('registers the six V1 cover-letter templates and the two added families', () => {
    expect(isCoverLetterTemplateId('classic')).toBe(true);
    expect(isCoverLetterTemplateId('minimalist')).toBe(true);
    expect(isCoverLetterTemplateId('editorial')).toBe(true);
    expect(isCoverLetterTemplateId('structured')).toBe(true);
    expect(isCoverLetterTemplateId('standard')).toBe(false);
  });
});

describe('prose drafts (bio, LinkedIn, outreach, referral, thank-you)', () => {
  const role = fact({
    id: 'e1',
    factType: 'experience',
    value: { position: 'Cataloguer', company: 'Northwind Cataloguing', startDate: '2019-03', endDate: '2024-06' },
  });
  const skill = fact({ id: 's1', factType: 'skill', value: { name: 'SQL' } });
  const draftOnly = fact({ id: 'd1', factType: 'skill', value: { name: 'COBOL' }, confirmation: 'draft' });
  const facts = [role, skill, draftOnly];
  const referral =
    'Dear Grace, I hope you are well. I am applying for the Records Analyst role at Babbage and would be grateful for a referral. ' +
    'At Northwind Cataloguing I worked as a cataloguer and used SQL every week to keep inventory records accurate. ' +
    'If you are comfortable, could you pass my application to the hiring team? Thank you for considering it.';
  const context = { organization: 'Babbage', role: 'Records Analyst', contactName: 'Grace Hopper' };

  it('accepts grounded prose and records the facts it names', () => {
    const result = evaluateProse('referral_request', { body: referral, factIds: ['e1', 'd1', 'nope'] }, facts, context);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.factIds).toEqual(['e1', 's1']);
  });

  it('refuses joined fact lines, short text, and missing targets', () => {
    expect(evaluateProse('bio', { body: writingBody(facts).body }, facts)).toMatchObject({ ok: false });
    expect(evaluateProse('thank_you', { body: 'Thanks.' }, facts)).toMatchObject({ ok: false, reason: 'incomplete_body' });
    const noTarget = referral.replace(/Babbage/g, 'your company').replace('Records Analyst', 'open');
    expect(evaluateProse('referral_request', { body: noTarget }, facts, context)).toMatchObject({ ok: false, reason: 'missing_target' });
  });

  it('refuses invented numbers, years, employers, contacts, and current-role claims', () => {
    expect(
      evaluateProse('referral_request', { body: referral.replace('every week', 'for 12 teams') }, facts, context),
    ).toMatchObject({ ok: false, reason: 'unsupported_number', claim: '12' });
    expect(
      evaluateProse('referral_request', { body: referral.replace('and used', 'in 2015 and used') }, facts, context),
    ).toMatchObject({ ok: false, reason: 'unsupported_date' });
    expect(
      evaluateProse('referral_request', { body: referral.replace('every week', 'every week, and later worked at Initech') }, facts, context),
    ).toMatchObject({ ok: false, reason: 'unsupported_employer' });
    expect(evaluateProse('referral_request', { body: referral.replace('Dear Grace', 'Dear Margaret') }, facts, context)).toMatchObject({
      ok: false,
      reason: 'unsupported_contact',
    });
    expect(evaluateProse('referral_request', { body: referral.replace('Dear Grace', 'Dear Hiring Manager') }, facts, context)).toMatchObject({
      ok: true,
    });
    expect(
      evaluateProse('referral_request', { body: referral.replace('I worked as', 'I currently work as') }, facts, context),
    ).toMatchObject({ ok: false });
    expect(
      evaluateProse(
        'referral_request',
        { body: referral.replace('At Northwind Cataloguing I worked', 'I worked at Babbage before, and at Northwind Cataloguing I worked') },
        facts,
        context,
      ),
    ).toMatchObject({ ok: false, reason: 'target_as_past_employer' });
  });

  it('lets a thank-you note use the interview date the person gave', () => {
    const note =
      'Dear Grace Hopper, thank you for speaking with me on 12 November 2026 about the Records Analyst role at Babbage. ' +
      'I enjoyed hearing how the team keeps its records accurate. I remain very interested and look forward to hearing from you.';
    expect(evaluateProse('thank_you', { body: note }, facts, { ...context, interviewDate: '2026-11-12' })).toMatchObject({ ok: true });
    expect(evaluateProse('thank_you', { body: note }, facts, context)).toMatchObject({ ok: false });
  });

  it('validates context and readiness before anything is charged', () => {
    expect(normalizeWritingContext({ organization: '  Babbage  ', role: '' })).toEqual({ ok: true, context: { organization: 'Babbage' } });
    expect(normalizeWritingContext({ salary: '1' })).toMatchObject({ ok: false, reason: 'unknown_field' });
    expect(normalizeWritingContext({ interviewDate: '12/11/2026' })).toMatchObject({ ok: false, field: 'context.interviewDate' });
    expect(normalizeWritingContext({ contactName: 'x'.repeat(81) })).toMatchObject({ ok: false, reason: 'too_long' });
    expect(proseReady('thank_you', facts, { listing: false, context: {} })).toMatchObject({ ok: false, reason: 'missing_target' });
    expect(proseReady('thank_you', facts, { listing: false, context: { role: 'Analyst' } })).toEqual({ ok: true });
    expect(proseReady('bio', [draftOnly], { listing: false, context: {} })).toMatchObject({ reason: 'no_confirmed_facts' });
    expect(writingTitle('thank_you', 'Babbage')).toBe('Thank-you note to Babbage');
    expect(writingTitle('referral_request', null)).toBe('Referral request');
    expect(salutationNames('Hello Ada Lovelace,\nBody')).toEqual(['Ada Lovelace']);
  });
});
