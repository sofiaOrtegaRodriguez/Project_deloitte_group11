-- CreateEnum
CREATE TYPE "SimulationStatus" AS ENUM ('STOPPED', 'RUNNING', 'PAUSED', 'FINISHED');

-- CreateTable
CREATE TABLE "simulation_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "status" "SimulationStatus" NOT NULL DEFAULT 'STOPPED',
    "start_date" DATE,
    "current_date" DATE,
    "seconds_per_day" INTEGER NOT NULL DEFAULT 10,
    "previous_reference_date" DATE,
    "last_step_at" TIMESTAMP(3),

    CONSTRAINT "simulation_state_pkey" PRIMARY KEY ("id")
);
