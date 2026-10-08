-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('ACTIVO', 'ARCHIVADO');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('DISPONIBLE', 'UTILIZADO', 'EXPIRADO', 'REVOGADO');

-- CreateEnum
CREATE TYPE "ToothType" AS ENUM ('PERMANENTE', 'TEMPORAL');

-- CreateEnum
CREATE TYPE "ToothStatus" AS ENUM ('SANO', 'CARIES', 'RESTAURACION', 'CORONA', 'AUSENTE', 'EXTRACCION_INDICADA', 'EXTRACCION_REALIZADA', 'ENDODONCIA', 'IMPLANTE', 'PROTESIS', 'FRACTURA', 'RETENIDO', 'TRATAMIENTO_PENDIENTE', 'OTRO');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'SENA_REALIZADA', 'PRESENTE', 'EN_ATENCION', 'ATENDIDO', 'CANCELADO', 'AUSENTE', 'REPROGRAMADO');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'OTRO');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('RADIOGRAFIA', 'FOTOGRAFIA', 'IMAGEN', 'PDF', 'DOCUMENTO', 'ESTUDIO');

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "permissions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "dni" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "role_id" UUID NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(255),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'DISPONIBLE',
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "used_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "dni" VARCHAR(20) NOT NULL,
    "birth_date" DATE,
    "phone" VARCHAR(50),
    "email" VARCHAR(255),
    "address" VARCHAR(255),
    "locality" VARCHAR(100),
    "province" VARCHAR(100),
    "emergency_contact" VARCHAR(255),
    "health_insurer" VARCHAR(100),
    "member_number" VARCHAR(100),
    "allergies" TEXT,
    "medications" TEXT,
    "background" TEXT,
    "notes" TEXT,
    "status" "PatientStatus" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_by_id" UUID,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_records" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "reason" TEXT,
    "diagnosis" TEXT,
    "treatment" TEXT,
    "observations" TEXT,
    "indications" TEXT,
    "tooth_numbers" INTEGER[],
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "clinical_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teeth" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "fdi_number" INTEGER NOT NULL,
    "type" "ToothType" NOT NULL,
    "current_status" "ToothStatus" NOT NULL DEFAULT 'SANO',
    "observations" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teeth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tooth_events" (
    "id" UUID NOT NULL,
    "tooth_id" UUID NOT NULL,
    "status" "ToothStatus" NOT NULL,
    "note" TEXT,
    "event_date" DATE NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tooth_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 30,
    "reason" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDIENTE',
    "observations" TEXT,
    "signa_required" BOOLEAN NOT NULL DEFAULT false,
    "signa_amount" DECIMAL(10,2),
    "signa_paid" BOOLEAN NOT NULL DEFAULT false,
    "signa_received" DECIMAL(10,2),
    "signa_date" DATE,
    "signa_method" "PaymentMethod",
    "signa_notes" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "cancel_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_events" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "from_status" "AppointmentStatus",
    "to_status" "AppointmentStatus" NOT NULL,
    "reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_files" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "tooth_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "kind" "FileKind" NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "medical_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(60) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB,
    "ip" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "users_dni_key" ON "users"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_last_name_idx" ON "users"("last_name");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_codes_code_key" ON "invitation_codes"("code");

-- CreateIndex
CREATE INDEX "invitation_codes_status_idx" ON "invitation_codes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "patients_dni_key" ON "patients"("dni");

-- CreateIndex
CREATE INDEX "patients_last_name_idx" ON "patients"("last_name");

-- CreateIndex
CREATE INDEX "patients_status_idx" ON "patients"("status");

-- CreateIndex
CREATE INDEX "clinical_records_patient_id_date_idx" ON "clinical_records"("patient_id", "date");

-- CreateIndex
CREATE INDEX "teeth_patient_id_idx" ON "teeth"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "teeth_patient_id_fdi_number_key" ON "teeth"("patient_id", "fdi_number");

-- CreateIndex
CREATE INDEX "tooth_events_tooth_id_event_date_idx" ON "tooth_events"("tooth_id", "event_date");

-- CreateIndex
CREATE INDEX "appointments_date_idx" ON "appointments"("date");

-- CreateIndex
CREATE INDEX "appointments_patient_id_date_idx" ON "appointments"("patient_id", "date");

-- CreateIndex
CREATE INDEX "appointments_professional_id_date_idx" ON "appointments"("professional_id", "date");

-- CreateIndex
CREATE INDEX "appointment_events_appointment_id_created_at_idx" ON "appointment_events"("appointment_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "medical_files_storage_key_key" ON "medical_files"("storage_key");

-- CreateIndex
CREATE INDEX "medical_files_patient_id_idx" ON "medical_files"("patient_id");

-- CreateIndex
CREATE INDEX "medical_files_tooth_id_idx" ON "medical_files"("tooth_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_codes" ADD CONSTRAINT "invitation_codes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_codes" ADD CONSTRAINT "invitation_codes_used_by_id_fkey" FOREIGN KEY ("used_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teeth" ADD CONSTRAINT "teeth_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tooth_events" ADD CONSTRAINT "tooth_events_tooth_id_fkey" FOREIGN KEY ("tooth_id") REFERENCES "teeth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tooth_events" ADD CONSTRAINT "tooth_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_files" ADD CONSTRAINT "medical_files_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_files" ADD CONSTRAINT "medical_files_tooth_id_fkey" FOREIGN KEY ("tooth_id") REFERENCES "teeth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_files" ADD CONSTRAINT "medical_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
