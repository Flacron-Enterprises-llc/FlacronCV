import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CoverLetterService } from './cover-letter.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { FeatureFlagGuard, RequireFeature } from '../../common/guards/feature-flag.guard';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { CreateCoverLetterData, UpdateCoverLetterData, GenerateCoverLetterData } from '@flacroncv/shared-types';

@ApiTags('cover-letters')
@Controller('cover-letters')
@UseGuards(FirebaseAuthGuard, FeatureFlagGuard)
@ApiBearerAuth()
export class CoverLetterController {
  constructor(private readonly coverLetterService: CoverLetterService) {}

  // Creation/generation is gated by the coverLettersEnabled flag; reading,
  // editing, and deleting existing letters stay available so turning the
  // feature off never traps a user's existing data.
  @Post()
  @RequireFeature('coverLettersEnabled')
  async create(@CurrentUser() user: FirebaseUser, @Body() data: CreateCoverLetterData) {
    return this.coverLetterService.create(user.uid, data);
  }

  @Get()
  async list(@CurrentUser() user: FirebaseUser, @Query('page') page?: number) {
    return this.coverLetterService.listByUser(user.uid, page || 1);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.coverLetterService.findByIdOrThrow(id, user.uid);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() data: UpdateCoverLetterData,
  ) {
    return this.coverLetterService.update(id, user.uid, data);
  }

  @Post(':id/duplicate')
  @RequireFeature('coverLettersEnabled')
  async duplicate(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.coverLetterService.duplicate(id, user.uid);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    await this.coverLetterService.delete(id, user.uid);
  }

  @Post(':id/ai/generate')
  // Both switches: this is a cover-letter route AND an AI route. With only the
  // former, flipping the AI kill-switch off still let this endpoint spend
  // credits and call the provider.
  @RequireFeature('coverLettersEnabled', 'aiEnabled')
  async generateWithAI(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() data: GenerateCoverLetterData,
  ) {
    return this.coverLetterService.generateWithAI(id, user.uid, data);
  }
}
