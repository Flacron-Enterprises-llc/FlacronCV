import { PartialType } from '@nestjs/swagger';
import { UpdateJobData } from '@flacroncv/shared-types';
import { CreateJobDto } from './create-job.dto';

/**
 * Every create field, all optional. PartialType keeps the validators (and the
 * nested-array transforms) of CreateJobDto, so the two cannot drift apart —
 * the old hand-copied UpdateJobDto had to be edited in step with it.
 */
export class UpdateJobDto extends PartialType(CreateJobDto) implements UpdateJobData {}
