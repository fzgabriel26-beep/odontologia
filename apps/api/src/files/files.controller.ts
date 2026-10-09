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
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
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
import { medicalFileSchema } from '../swagger/response-schemas';
import { arrayOf, zodToSchema } from '../swagger/zod-schema';
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

/** Body multipart de subida: `file` binario + campos de texto validados por Zod. */
const patientUploadFields = zodToSchema(uploadFileFieldsSchema);
const toothUploadFields = zodToSchema(uploadToToothFieldsSchema);

const uploadToPatientBodySchema: SchemaObject = {
  type: 'object',
  description: 'multipart/form-data: archivo binario + campos de texto.',
  properties: {
    file: { type: 'string', format: 'binary', description: 'Archivo a subir.' },
    ...patientUploadFields.properties,
  },
  required: ['file', ...(patientUploadFields.required ?? [])],
};

const uploadToToothBodySchema: SchemaObject = {
  type: 'object',
  description: 'multipart/form-data: archivo binario + campos de texto.',
  properties: {
    file: { type: 'string', format: 'binary', description: 'Archivo a subir.' },
    ...toothUploadFields.properties,
  },
  required: ['file', ...(toothUploadFields.required ?? [])],
};

/**
 * Archivos médicos (SDD CU-10 / fase 7): subida multipart con validación de
 * extensión/MIME/tamaño, metadatos, proxy de descarga/visualización autenticado
 * y archivado. Requiere `files.read` para lectura y `files.write` para mutar.
 */
@ApiTags('Archivos')
@ApiSecurity('sessionCookie')
@Controller()
@RequirePermission('files.read')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('patients/:id/files')
  @RequirePermission('files.write')
  @UseInterceptors(FileInterceptor('file', uploadOptions()))
  @ApiOperation({
    summary: 'Subir archivo a un paciente',
    description:
      'multipart/form-data con `file` y campos de texto; valida extensión (whitelist), ' +
      'tamaño (MAX_UPLOAD_MB) y magic bytes: el MIME declarado por el cliente no se confía. ' +
      'Requiere `files.write` y audita FILE_UPLOADED.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del paciente' })
  @ApiBody({ schema: uploadToPatientBodySchema })
  @ApiCreatedResponse({ description: 'Archivo registrado.', schema: medicalFileSchema })
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
  @ApiOperation({
    summary: 'Subir archivo a un diente',
    description:
      'multipart/form-data con `file` y campos de texto; asocia el archivo al diente de la ' +
      'ruta y aplica las mismas validaciones (extensión, tamaño, magic bytes). Requiere ' +
      '`files.write` y audita FILE_UPLOADED.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del diente' })
  @ApiBody({ schema: uploadToToothBodySchema })
  @ApiCreatedResponse({ description: 'Archivo registrado.', schema: medicalFileSchema })
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
  @ApiOperation({
    summary: 'Listar archivos de un paciente',
    description:
      'Metadatos de los archivos del paciente (sin binarios ni claves de almacenamiento). ' +
      'Requiere `files.read`.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del paciente' })
  @ApiOkResponse({ description: 'Archivos del paciente.', schema: arrayOf(medicalFileSchema) })
  listPatientFiles(@Param('id', UuidParamPipe) id: string): Promise<MedicalFileWithUploader[]> {
    return this.filesService.listPatientFiles(id);
  }

  @Get('files/:id')
  @ApiOperation({
    summary: 'Obtener metadatos de un archivo',
    description:
      'Devuelve los metadatos visibles (nombre, tipo, subidor); el binario solo se sirve ' +
      'por el proxy de contenido. Requiere `files.read`.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del archivo' })
  @ApiOkResponse({ description: 'Metadatos del archivo.', schema: medicalFileSchema })
  getFile(@Param('id', UuidParamPipe) id: string): Promise<MedicalFileWithUploader> {
    return this.filesService.getFile(id);
  }

  /**
   * Proxy de descarga/visualización: el binario sale SIEMPRE por acá, con
   * sesión y permiso (nunca una URL pública). `disposition=attachment`
   * fuerza descarga; por defecto `inline` para visualizar en el navegador.
   */
  @Get('files/:id/content')
  @ApiOperation({
    summary: 'Descargar o visualizar el archivo',
    description:
      'Proxy autenticado: el binario siempre sale por acá, con sesión y permiso (nunca una ' +
      'URL pública) y audita FILE_DOWNLOADED. `disposition=attachment` fuerza descarga; por ' +
      'defecto se sirve `inline` para visualizar en el navegador.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del archivo' })
  @ApiQuery({
    name: 'disposition',
    required: false,
    enum: ['attachment', 'inline'],
    description: 'Modo de Content-Disposition (por defecto inline).',
  })
  @ApiResponse({
    status: 200,
    description: 'Archivo binario (Content-Disposition con el nombre original y el modo).',
    content: {
      'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
    },
  })
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
  @ApiOperation({
    summary: 'Archivar un archivo',
    description:
      'Archivado lógico: marca `archivedAt` sin borrar el binario (409 si ya estaba ' +
      'archivado). Requiere `files.write` y audita FILE_ARCHIVED.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID del archivo' })
  @ApiOkResponse({ description: 'Archivo archivado.', schema: medicalFileSchema })
  archiveFile(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithIp,
  ): Promise<MedicalFileWithUploader> {
    return this.filesService.archiveFile(id, actorOf(user, req));
  }
}
