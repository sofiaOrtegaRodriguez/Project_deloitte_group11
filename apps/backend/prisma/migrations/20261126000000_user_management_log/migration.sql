-- CreateEnum
CREATE TYPE "UserManagementAction" AS ENUM ('APPROVE', 'REJECT', 'REMOVE', 'RESTORE');

-- CreateTable
CREATE TABLE "user_management_log" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" "UserManagementAction" NOT NULL,
    "affected_user_id" INTEGER NOT NULL,
    "actor_id" INTEGER,

    CONSTRAINT "user_management_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_management_log_created_at_idx" ON "user_management_log"("created_at");

-- AddForeignKey
ALTER TABLE "user_management_log" ADD CONSTRAINT "user_management_log_affected_user_id_fkey" FOREIGN KEY ("affected_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_management_log" ADD CONSTRAINT "user_management_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
