/*
  Warnings:

  - You are about to drop the column `created_at` on the `chat_messages` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `conversations` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `food_entries` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `food_entries` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `goals` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `refresh_tokens` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `weight_logs` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `weight_logs` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "chat_messages" DROP COLUMN "created_at";

-- AlterTable
ALTER TABLE "conversations" DROP COLUMN "created_at";

-- AlterTable
ALTER TABLE "food_entries" DROP COLUMN "created_at",
DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "goals" DROP COLUMN "created_at";

-- AlterTable
ALTER TABLE "refresh_tokens" DROP COLUMN "created_at";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "created_at",
DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "weight_logs" DROP COLUMN "created_at",
DROP COLUMN "updated_at";
