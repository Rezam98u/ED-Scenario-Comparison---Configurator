-- CreateTable
CREATE TABLE "EnergyDataset" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'default',
    "rangeStart" DATE NOT NULL,
    "rangeEnd" DATE NOT NULL,
    "timestamps" JSONB NOT NULL,
    "baseline" JSONB NOT NULL,
    "scenario" JSONB NOT NULL,
    "kpis" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnergyDataset_key" PRIMARY KEY ("id")
);
