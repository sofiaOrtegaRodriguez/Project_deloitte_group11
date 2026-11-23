-- CreateTable
CREATE TABLE "reminder_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "last_round_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_state_pkey" PRIMARY KEY ("id")
);
