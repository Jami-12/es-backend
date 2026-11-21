-- Hashed, short-lived verification codes for password resets and the
-- super-admin data wipe. Codes are bound to a user and cascade with it.

CREATE TYPE "VerificationCodePurpose" AS ENUM ('PASSWORD_RESET', 'DATA_RESET');

CREATE TABLE IF NOT EXISTS "verification_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "purpose" "VerificationCodePurpose" NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "verification_codes_email_purpose_idx"
  ON "verification_codes"("email", "purpose");
CREATE INDEX IF NOT EXISTS "verification_codes_userId_purpose_idx"
  ON "verification_codes"("userId", "purpose");
CREATE INDEX IF NOT EXISTS "verification_codes_expiresAt_idx"
  ON "verification_codes"("expiresAt");

ALTER TABLE "verification_codes" DROP CONSTRAINT IF EXISTS "verification_codes_userId_fkey";
ALTER TABLE "verification_codes"
  ADD CONSTRAINT "verification_codes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
