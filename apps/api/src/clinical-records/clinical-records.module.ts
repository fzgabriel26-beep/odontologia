import '../common/config/env';
import { Module } from '@nestjs/common';
import { ClinicalRecordsController } from './clinical-records.controller';
import { ClinicalRecordsService } from './clinical-records.service';

@Module({
  controllers: [ClinicalRecordsController],
  providers: [ClinicalRecordsService],
  exports: [ClinicalRecordsService],
})
export class ClinicalRecordsModule {}
