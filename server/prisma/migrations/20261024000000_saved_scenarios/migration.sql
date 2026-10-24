-- CreateTable
CREATE TABLE "SavedScenario" (
    "id" TEXT NOT NULL,
    "pvKw" DOUBLE PRECISION NOT NULL,
    "kpis" JSONB NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedScenario_pkey" PRIMARY KEY ("id")
);
