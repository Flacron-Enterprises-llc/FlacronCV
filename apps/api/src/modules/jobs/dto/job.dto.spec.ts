import { BadRequestException } from '@nestjs/common';
import { transformBody } from '../../../common/test/app-validation-pipe';
import { CreateJobDto } from './create-job.dto';
import { UpdateJobDto } from './update-job.dto';
import { RefreezeJobDocumentDto } from './job-parts.dto';

async function expectReject(cls: new () => object, payload: unknown) {
  await expect(transformBody(cls, payload)).rejects.toBeInstanceOf(BadRequestException);
}

describe('Job write DTOs (ValidationPipe)', () => {
  it('accepts the payload an old mobile app sends (legacy status + single contact)', async () => {
    // Exact keys from the pre-workspace apps/mobile JobForm toPayload().
    const result = await transformBody(CreateJobDto, {
      company: 'Acme',
      position: 'Engineer',
      status: 'wishlist',
      jobUrl: 'https://acme.com/jobs/1',
      location: 'Remote',
      salaryRange: '$100k',
      contactName: 'Jane',
      contactEmail: 'jane@acme.com',
      appliedDate: '2026-09-08',
      interviewDate: '2026-09-12T14:30',
      followUpDate: '2026-09-20',
      notes: 'n',
      linkedCVId: 'cv1',
      linkedCoverLetterId: null,
    });
    expect(result.status).toBe('wishlist');
  });

  it.each(['offer', 'accepted', 'saved', 'preparing', 'offered', 'withdrawn'])('accepts status %s', async (status) => {
    await expect(transformBody(UpdateJobDto, { status })).resolves.toBeDefined();
  });

  it('rejects an unknown status', async () => {
    await expectReject(UpdateJobDto, { status: 'hired' });
  });

  it('accepts the workspace fields', async () => {
    const result = await transformBody(CreateJobDto, {
      company: 'Acme',
      position: 'Engineer',
      status: 'preparing',
      deadline: '2026-12-01',
      jobDescription: 'Build things',
      jobDescriptionSource: 'opportunity',
      opportunityId: 'opp-1',
      outcome: null,
      contacts: [{ id: 'c1', name: 'Sam', role: 'Recruiter', email: '', phone: '+1', notes: null }],
      checklist: [{ label: 'Portfolio', kind: 'document', done: false }],
      formAnswers: [{ question: 'Why?', answer: 'Because' }],
    });
    expect(result.contacts?.[0].name).toBe('Sam');
    expect(result.checklist).toHaveLength(1);
  });

  it('rejects a malformed deadline, contact email, outcome or origin', async () => {
    await expectReject(UpdateJobDto, { deadline: '01/12/2026' });
    await expectReject(UpdateJobDto, { contacts: [{ name: 'Sam', email: 'not-an-email' }] });
    await expectReject(UpdateJobDto, { outcome: 'hired' });
    // The origin is server-recorded; a client may not send it.
    await expectReject(UpdateJobDto, { outcome: 'accepted', outcomeOrigin: 'imported' });
  });

  it('caps the job description and the number of rows', async () => {
    await expectReject(UpdateJobDto, { jobDescription: 'x'.repeat(20_001) });
    await expectReject(UpdateJobDto, { checklist: Array.from({ length: 51 }, (_, i) => ({ label: `i${i}` })) });
    await expectReject(UpdateJobDto, { contacts: Array.from({ length: 21 }, () => ({ name: 'a' })) });
    await expectReject(UpdateJobDto, { formAnswers: [{ question: 'q', answer: 'a'.repeat(5001) }] });
  });

  it('rejects unknown keys inside nested rows', async () => {
    await expectReject(UpdateJobDto, { checklist: [{ label: 'a', evil: true }] });
  });

  it('refreeze takes only cv or cover_letter', async () => {
    await expect(transformBody(RefreezeJobDocumentDto, { kind: 'cv' })).resolves.toBeDefined();
    await expectReject(RefreezeJobDocumentDto, { kind: 'resume' });
  });
});
