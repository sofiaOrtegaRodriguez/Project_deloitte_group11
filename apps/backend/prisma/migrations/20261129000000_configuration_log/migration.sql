-- CreateTable
CREATE TABLE "configuration_log" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER,
    "user_name" TEXT NOT NULL,
    "changes" JSONB NOT NULL,

    CONSTRAINT "configuration_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "configuration_log" ADD CONSTRAINT "configuration_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
