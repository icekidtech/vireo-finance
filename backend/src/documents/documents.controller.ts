import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  DocumentsService,
  MAX_DOCUMENT_BYTES,
  UploadedFile as UploadedFileLike,
} from './documents.service';

@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('status')
  status() {
    return { available: this.documents.isAvailable() };
  }

  /** multipart/form-data: `file` plus `kind`. Held in memory (8 MB cap), encrypted, then stored privately. */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body('kind') kind: string,
    @UploadedFile() file: UploadedFileLike | undefined,
  ) {
    return this.documents.upload(user.userId, String(kind ?? ''), file);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.list(user.userId);
  }

  /** The file, served through the API only after an ownership / staff check. */
  @Get(':id/content')
  async content(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { bytes, mime } = await this.documents.read(id, user.userId);
    res.set({
      'Content-Type': mime,
      'Content-Length': String(bytes.length),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(bytes);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.documents.remove(user.userId, id);
  }
}
