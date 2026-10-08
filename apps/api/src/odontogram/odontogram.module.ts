import '../common/config/env';
import { Module } from '@nestjs/common';
import { OdontogramController } from './odontogram.controller';
import { OdontogramPdfService } from './odontogram-pdf.service';
import { OdontogramService } from './odontogram.service';

@Module({
  controllers: [OdontogramController],
  providers: [OdontogramService, OdontogramPdfService],
  exports: [OdontogramService, OdontogramPdfService],
})
export class OdontogramModule {}
