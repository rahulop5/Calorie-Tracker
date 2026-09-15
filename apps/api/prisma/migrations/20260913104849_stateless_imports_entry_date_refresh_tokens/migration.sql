/*
  Warnings:

  - You are about to drop the column `logged_at` on the `food_entries` table. All the data in the column will be lost.
  - You are about to drop the `import_jobs` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `entry_date` to the `food_entries` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "EntrySource" ADD VALUE 'AI_ESTIMATE';

-- DropForeignKey
ALTER TABLE "import_jobs" DROP CONSTRAINT "import_jobs_user_id_fkey";

-- DropIndex
DROP INDEX "food_entries_user_id_logged_at_idx";

-- DropIndex
DROP INDEX "food_entries_user_id_meal_type_logged_at_idx";

-- AlterTable
ALTER TABLE "food_entries" DROP COLUMN "logged_at",
ADD COLUMN     "entry_date" DATE NOT NULL;

-- DropTable
DROP TABLE "import_jobs";

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "food_entries_user_id_entry_date_idx" ON "food_entries"("user_id", "entry_date" DESC);

-- CreateIndex
CREATE INDEX "food_entries_user_id_meal_type_entry_date_idx" ON "food_entries"("user_id", "meal_type", "entry_date" DESC);

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
