-- AlterTable
ALTER TABLE "users" RENAME COLUMN "contactNumber" TO "phone";

-- AlterTable
ALTER TABLE "users" ADD COLUMN "imageUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN "imagePublicId" TEXT NOT NULL DEFAULT '';
