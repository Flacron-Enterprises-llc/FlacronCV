import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';

@ApiTags('jobs')
@Controller('jobs')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth()
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  create(@CurrentUser() user: FirebaseUser, @Body() data: CreateJobDto) {
    return this.jobsService.create(user.uid, data);
  }

  @Get()
  list(@CurrentUser() user: FirebaseUser) {
    return this.jobsService.listByUser(user.uid);
  }

  /**
   * Report whether the user already tracks this company + position, so the UI
   * can ask them to confirm before adding a duplicate application. A lookup
   * rather than a hard block: re-applying to the same role is legitimate, it
   * just should not happen by accident.
   */
  @Get('duplicate-check')
  async duplicateCheck(
    @CurrentUser() user: FirebaseUser,
    @Query('company') company: string,
    @Query('position') position: string,
  ) {
    if (!company?.trim() || !position?.trim()) return { duplicate: null };
    const duplicate = await this.jobsService.findDuplicate(user.uid, company, position);
    return { duplicate };
  }

  @Get(':id')
  findOne(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.jobsService.findByIdOrThrow(id, user.uid);
  }

  @Put(':id')
  update(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() data: UpdateJobDto,
  ) {
    return this.jobsService.update(id, user.uid, data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    await this.jobsService.delete(id, user.uid);
  }
}
