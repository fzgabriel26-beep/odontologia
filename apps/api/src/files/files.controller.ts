import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { ServerResponse } from 'node:http';
import {
  uploadFileFieldsSchema,
  uploadToToothFieldsSchema,
  type UploadFileFieldsInput,
  type UploadToToothFieldsInput,
} from '@odonto/validation';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { maxUploadBytes } from '../common/utils/upload-limit';
import { FilesService, type FileActor, type MedicalFileWithUploader } from './files.service';

interface RequestWithIp {
  ip?: string;
}

function actorOf(user: AuthUser, req: RequestWithIp): FileActor {
  return { id: user.id, ip: req.ip };
}

/** Multipart en memoria con límite MAX_UPLOAD_MB (validación extra en servicio). */
function uploadOptions() {
  return {
    storage: memoryStorage(),
    limits: { fileSize: maxUploadBytes() },
  };
}

/**
 * Archivos médicos (SDD CU-10 / fase 7): subida multipart con validación de
 * extensión/MIME/tamaño, metadatos, proxy de descarga/visualización autenticado
 * y archivado. Requiere `files.read` para lectura y `files.write` para mutar.
 */
@Controller()
@RequirePermission('files.read')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('patients/:id/files')
  @RequirePermission('files.write')
  @UseInterceptors(FileInterceptor('file', uploadOptions()))
  uploadToPatient(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(uploadFileFieldsSchema)) body: UploadFileFieldsInput,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<MedicalFileWithUploader> {
    return this.filesService.uploadToPatient(id, file, body, actorOf(user, req));
  }

  @Post('teeth/:id/files')
  @RequirePermission('files.write')
  @UseInterceptors(FileInterceptor('file', uploadOptions()))
  uploadToTooth(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(uploadToToothFieldsSchema)) body: UploadToToothFieldsInput,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<MedicalFileWithUploader> {
    return this.filesService.uploadToTooth(id, file, body, actorOf(user, req));
  }

  @Get('patients/:id/files')
  listPatientFiles(@Param('id', UuidParamPipe) id: string): Promise<MedicalFileWithUploader[]> {
    return this.filesService.listPatientFiles(id);
  }

  @Get('files/:id')
  getFile(@Param('id', UuidParamPipe) id: string): Promise<MedicalFileWithUploader> {
    return this.filesService.getFile(id);
  }

  /**
   * Proxy de descarga/visualización: el binario sale SIEMPRE por acá, con
   * sesión y permiso (nunca una URL pública). `disposition=attachment`
   * fuerza descarga; por defecto `inline` para visualizar en el navegador.
   */
  @Get('files/:id/content')
  async getContent(
    @Param('id', UuidParamPipe) id: string,
    @Query('disposition') disposition: string | undefined,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
    @Res() res: ServerResponse,
  ): Promise<void> {
    const { file, stream } = await this.filesService.openFile(id, actorOf(user, req));

    const mode = disposition === 'attachment' ? 'attachment' : 'inline';
    const asciiName = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader(
      'Content-Disposition',
      `${mode}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
    // endurecimiento: contenido servido nunca ejecuta scripts ni se cachea.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');

    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  @Post('files/:id/archive')
  @HttpCode(200)
  @RequirePermission('files.write')
  archiveFile(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<MedicalFileWithUploader> {
    return this.filesService.archiveFile(id, actorOf(user, req));
  }
}
