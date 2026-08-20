import 'dotenv/config';
import { hash } from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { rejectDocumentedPlaceholder } from '../src/config/env.validation';

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const databaseUrl = requiredEnv('DATABASE_URL');
const adminUsername = requiredEnv('ADMIN_USERNAME');
const adminPassword = requiredEnv('ADMIN_PASSWORD');
rejectDocumentedPlaceholder('DATABASE_URL', databaseUrl);
rejectDocumentedPlaceholder('ADMIN_PASSWORD', adminPassword);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const date = (value?: string) => (value ? new Date(`${value}T00:00:00.000Z`) : null);

async function main() {
  const mockDataPath = '../../src/lib/mockData.ts';
  const { erpItems, supplierOrders } = await import(mockDataPath) as {
    supplierOrders: Array<Record<string, any>>;
    erpItems: Array<Record<string, any>>;
  };
  const passwordHash = await hash(adminPassword);

  await prisma.adminUser.upsert({
    where: { singletonKey: 1 },
    update: { username: adminUsername, passwordHash },
    create: {
      singletonKey: 1,
      username: adminUsername,
      passwordHash,
    },
  });

  for (const order of supplierOrders) {
    await prisma.supplierOrder.upsert({
      where: { id: order.id },
      update: {
        supplierOrderNumber: order.supplierOrderNumber,
        supplier: order.supplier,
        status: order.status,
        createdAt: date(order.createdAt)!,
        currentStage: order.currentStage,
        productionPlan: date(order.productionPlan),
        deadline: date(order.deadline),
      },
      create: {
        id: order.id,
        supplierOrderNumber: order.supplierOrderNumber,
        supplier: order.supplier,
        status: order.status,
        createdAt: date(order.createdAt)!,
        currentStage: order.currentStage,
        productionPlan: date(order.productionPlan),
        deadline: date(order.deadline),
      },
    });
  }

  for (const item of erpItems) {
    await prisma.erpItem.upsert({
      where: { id: item.id },
      update: {
        erpCode: item.erpCode,
        supplierOrderId: item.supplierOrderId,
        nomenclature: item.nomenclature,
        status: item.status,
        currentStage: item.currentStage,
        comment: item.comment,
        agreement: json(item.agreement),
        production: json(item.production),
        logistics: json(item.logistics),
        deadlines: json(item.deadlines),
        problems: json(item.problems),
        sources: json(item.sources),
        missingFields: json(item.missingFields),
        conflicts: json(item.conflicts),
        trustLevel: item.trustLevel,
      },
      create: {
        id: item.id,
        erpCode: item.erpCode,
        supplierOrderId: item.supplierOrderId,
        nomenclature: item.nomenclature,
        status: item.status,
        currentStage: item.currentStage,
        comment: item.comment,
        agreement: json(item.agreement),
        production: json(item.production),
        logistics: json(item.logistics),
        deadlines: json(item.deadlines),
        problems: json(item.problems),
        sources: json(item.sources),
        missingFields: json(item.missingFields),
        conflicts: json(item.conflicts),
        trustLevel: item.trustLevel,
      },
    });
  }
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
