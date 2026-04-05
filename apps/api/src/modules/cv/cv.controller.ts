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
import { CVService } from './cv.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { CreateCVData, UpdateCVData, CVSection } from '@flacroncv/shared-types';

@ApiTags('cvs')
@Controller('cvs')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth()
export class CVController {
  constructor(private readonly cvService: CVService) {}

  @Post()
  async create(@CurrentUser() user: FirebaseUser, @Body() data: CreateCVData) {
    return this.cvService.create(user.uid, data);
  }

  @Get()
  async list(
    @CurrentUser() user: FirebaseUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.cvService.listByUser(user.uid, page || 1, limit || 10);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.cvService.findByIdOrThrow(id, user.uid);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() data: UpdateCVData,
  ) {
    return this.cvService.update(id, user.uid, data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    await this.cvService.delete(id, user.uid);
  }

  @Post(':id/duplicate')
  async duplicate(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.cvService.duplicate(id, user.uid);
  }

  // Sections
  @Get(':id/sections')
  async getSections(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    await this.cvService.findByIdOrThrow(id, user.uid);
    return this.cvService.getSections(id);
  }

  @Post(':id/sections')
  async addSection(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() data: {
      id?: string;
      type: string;
      title: string;
      order: number;
      isVisible?: boolean;
      items?: any[];
    },
  ) {
    await this.cvService.findByIdOrThrow(id, user.uid);
    return this.cvService.addSection(id, data);
  }

  @Put(':id/sections/:sectionId')
  async updateSection(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Body() data: Partial<CVSection>,
  ) {
    await this.cvService.findByIdOrThrow(id, user.uid);
    return this.cvService.updateSection(id, sectionId, data);
  }

  @Delete(':id/sections/:sectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSection(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
  ) {
    await this.cvService.findByIdOrThrow(id, user.uid);
    await this.cvService.deleteSection(id, sectionId);
  }

  @Put(':id/sections/reorder')
  async reorderSections(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() body: { sectionOrder: string[] },
  ) {
    await this.cvService.findByIdOrThrow(id, user.uid);
    await this.cvService.reorderSections(id, body.sectionOrder);
    return { message: 'Sections reordered' };
  }

  // Versions
  @Get(':id/versions')
  async getVersions(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    await this.cvService.findByIdOrThrow(id, user.uid);
    return this.cvService.getVersions(id);
  }

  @Post(':id/versions')
  async createVersion(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() body: { description: string },
  ) {
    return this.cvService.createVersion(id, user.uid, body.description);
  }

  // Public sharing
  @Post(':id/share')
  async share(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.cvService.togglePublic(id, user.uid, true);
  }

  @Delete(':id/share')
  async unshare(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.cvService.togglePublic(id, user.uid, false);
  }
}
