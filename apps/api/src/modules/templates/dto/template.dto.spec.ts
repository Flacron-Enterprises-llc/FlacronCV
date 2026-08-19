import { BadRequestException } from '@nestjs/common';
import { SubscriptionPlan, TemplateCategory } from '@flacroncv/shared-types';
import { transformBody } from '../../../common/test/app-validation-pipe';
import { CreateTemplateDto, UpdateTemplateDto } from './template.dto';

describe('Template DTOs (ValidationPipe)', () => {
  it('accepts the admin create form', async () => {
    const result = await transformBody(CreateTemplateDto, {
      name: 'Modern',
      category: TemplateCategory.CV,
      tier: SubscriptionPlan.FREE,
    });
    expect(result.name).toBe('Modern');
  });

  it('rejects mass-assignment keys on create and update', async () => {
    await expect(
      transformBody(CreateTemplateDto, { name: 'X', usageCount: 99, createdBy: 'attacker' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      transformBody(UpdateTemplateDto, { name: 'X', usageCount: 99, id: 'hijacked' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
