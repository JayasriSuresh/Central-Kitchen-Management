import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding extra lookup data (Categories, Units, Raw Materials)...');

  // Get default tenant
  const tenant = await prisma.tenant.findUnique({ where: { code: 'CK' } });
  if (!tenant) {
    console.error('Default tenant "CK" not found. Please run the main seed first.');
    return;
  }

  // 1. Seed Categories
  const categories = ['Bakery', 'Sauces', 'Dairy', 'Meat', 'Vegetables', 'Beverages'];
  for (const catName of categories) {
    await prisma.productCategory.upsert({
      where: { tenant_id_name: { tenant_id: tenant.id, name: catName } },
      update: {},
      create: { tenant_id: tenant.id, name: catName },
    });
  }
  console.log('✓ Categories seeded.');

  // 2. Seed Units
  const units = [
    { name: 'Kilogram', symbol: 'kg' },
    { name: 'Gram', symbol: 'g' },
    { name: 'Litre', symbol: 'L' },
    { name: 'Millilitre', symbol: 'ml' },
    { name: 'Piece', symbol: 'pcs' },
  ];
  for (const u of units) {
    const existing = await prisma.unit.findFirst({ where: { symbol: u.symbol } });
    if (!existing) {
      await prisma.unit.create({ data: u });
    }
  }
  console.log('✓ Units seeded.');

  // 3. Seed Raw Materials
  const rawMaterials = [
    { name: 'Basmati Rice', category: 'Dry', symbol: 'kg' },
    { name: 'Atta (Wheat Flour)', category: 'Dry', symbol: 'kg' },
    { name: 'Toor Dal', category: 'Dry', symbol: 'kg' },
    { name: 'Paneer (Cottage Cheese)', category: 'Dairy', symbol: 'kg' },
    { name: 'Ghee (Clarified Butter)', category: 'Dairy', symbol: 'kg' },
    { name: 'Turmeric Powder', category: 'Spices', symbol: 'g' },
    { name: 'Garam Masala', category: 'Spices', symbol: 'g' },
    { name: 'Mustard Seeds', category: 'Spices', symbol: 'g' },
    { name: 'Curry Leaves', category: 'Fresh', symbol: 'g' },
    { name: 'Ginger Garlic Paste', category: 'Sauces', symbol: 'kg' },
    { name: 'Mustard Oil', category: 'Liquid', symbol: 'L' },
    { name: 'Coconut Milk', category: 'Liquid', symbol: 'L' },
  ];

  for (const rm of rawMaterials) {
    const unit = await prisma.unit.findFirst({ where: { symbol: rm.symbol } });
    const existing = await prisma.rawMaterial.findFirst({
      where: { tenant_id: tenant.id, name: rm.name },
    });
    if (!existing) {
      await prisma.rawMaterial.create({
        data: {
          tenant_id: tenant.id,
          name: rm.name,
          category: rm.category,
          unit_id: unit?.id,
          reorder_level: 5.0,
        },
      });
    }
  }
  console.log('✓ Raw Materials seeded.');
  console.log('Extra Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    throw e;
  })
  .finally(() => prisma.$disconnect());
