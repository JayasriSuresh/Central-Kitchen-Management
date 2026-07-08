import prisma from '../utils/prisma';
import { Prisma } from '@prisma/client';

/**
 * Consumes raw materials across active, non-expired batches using First-In-First-Out (FIFO).
 */
export async function consumeRawMaterialFIFO(
  tx: Prisma.TransactionClient,
  tenantId: number,
  rawMaterialId: number,
  quantityToConsume: number,
  referenceType: string,
  referenceId: number,
  createdBy: string
) {
  let remainingToConsume = Number(quantityToConsume);
  if (remainingToConsume <= 0) return;

  // Find all active, non-expired batches with remaining quantity
  const activeBatches = await tx.inventoryBatch.findMany({
    where: {
      tenant_id: tenantId,
      raw_material_id: rawMaterialId,
      quantity: { gt: 0 },
      OR: [
        { expiry_date: null },
        { expiry_date: { gt: new Date() } }
      ]
    },
    orderBy: {
      created_at: 'asc' // FIFO: oldest created_at first
    }
  });

  for (const batch of activeBatches) {
    if (remainingToConsume <= 0) break;

    const batchQty = Number(batch.quantity);
    const amountToDeduct = Math.min(remainingToConsume, batchQty);

    // Update batch quantity remaining
    await tx.inventoryBatch.update({
      where: { id: batch.id },
      data: {
        quantity: new Prisma.Decimal(batchQty - amountToDeduct)
      }
    });

    // Log the transaction
    await tx.stockTransaction.create({
      data: {
        tenant_id: tenantId,
        raw_material_id: rawMaterialId,
        inventory_batch_id: batch.id,
        transaction_type: 'production_consumption',
        quantity: new Prisma.Decimal(-amountToDeduct),
        reference_type: referenceType,
        reference_id: referenceId,
        remarks: `Consumed from Batch #${batch.batch_no || batch.id}`,
        created_by: createdBy
      }
    });

    remainingToConsume -= amountToDeduct;
  }

  if (remainingToConsume > 0) {
    throw new Error(`Insufficient stock for raw material ID ${rawMaterialId}. Missing ${remainingToConsume} units.`);
  }
}

/**
 * Adjusts raw material stock. Positive adjustment adds a batch, negative consumes FIFO.
 */
export async function adjustStock(
  tx: Prisma.TransactionClient,
  tenantId: number,
  rawMaterialId: number,
  quantity: number,
  reason: string,
  remarks: string,
  createdBy: string
) {
  if (quantity === 0) return;

  if (quantity > 0) {
    // Positive adjustment: Create a new batch
    const rm = await tx.rawMaterial.findFirst({
      where: { id: rawMaterialId, tenant_id: tenantId }
    });
    if (!rm) throw new Error(`Raw material ID ${rawMaterialId} not found.`);

    const stdPrice = rm.standard_price ? Number(rm.standard_price) : 0;
    const batchNo = `ADJ-${Date.now()}`;

    const batch = await tx.inventoryBatch.create({
      data: {
        tenant_id: tenantId,
        raw_material_id: rawMaterialId,
        batch_no: batchNo,
        quantity: new Prisma.Decimal(quantity),
        original_quantity: new Prisma.Decimal(quantity),
        purchase_price: new Prisma.Decimal(stdPrice),
        remarks: `${reason}: ${remarks || ''}`,
      }
    });

    await tx.stockTransaction.create({
      data: {
        tenant_id: tenantId,
        raw_material_id: rawMaterialId,
        inventory_batch_id: batch.id,
        transaction_type: 'adjustment',
        quantity: new Prisma.Decimal(quantity),
        remarks: `${reason}: ${remarks || ''}`,
        created_by: createdBy
      }
    });
  } else {
    // Negative adjustment: Consume FIFO
    let remainingToConsume = Math.abs(quantity);

    const activeBatches = await tx.inventoryBatch.findMany({
      where: {
        tenant_id: tenantId,
        raw_material_id: rawMaterialId,
        quantity: { gt: 0 },
        OR: [
          { expiry_date: null },
          { expiry_date: { gt: new Date() } }
        ]
      },
      orderBy: {
        created_at: 'asc' // FIFO
      }
    });

    for (const batch of activeBatches) {
      if (remainingToConsume <= 0) break;

      const batchQty = Number(batch.quantity);
      const amountToDeduct = Math.min(remainingToConsume, batchQty);

      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          quantity: new Prisma.Decimal(batchQty - amountToDeduct)
        }
      });

      await tx.stockTransaction.create({
        data: {
          tenant_id: tenantId,
          raw_material_id: rawMaterialId,
          inventory_batch_id: batch.id,
          transaction_type: 'adjustment',
          quantity: new Prisma.Decimal(-amountToDeduct),
          remarks: `${reason}: ${remarks || ''}`,
          created_by: createdBy
        }
      });

      remainingToConsume -= amountToDeduct;
    }

    if (remainingToConsume > 0) {
      throw new Error(`Insufficient stock to adjust. Missing ${remainingToConsume} units.`);
    }
  }
}
