import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { Prisma } from '@prisma/client';

const getTenantId = (req: Request): number => {
  const tenantId = (req as any).tenantId;
  if (!tenantId) throw new Error('Central Kitchen tenant scope is required');
  return tenantId;
};
const getUser = (req: Request) => (req as any).user as { id: number; username: string; user_id: string };

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Simulates FEFO allocation WITHOUT touching the database.
 * Returns which batches would be allocated and any shortage amount.
 */
async function simulateFEFOAllocation(
  tenantId: number,
  rawMaterialId: number,
  neededQty: number
) {
  const now = new Date();

  // FEFO: sort by expiry_date asc (nulls last), then created_at asc
  const activeBatches = await prisma.inventoryBatch.findMany({
    where: {
      tenant_id: tenantId,
      raw_material_id: rawMaterialId,
      quantity: { gt: 0 },
      OR: [{ expiry_date: null }, { expiry_date: { gt: now } }],
    },
    orderBy: [{ expiry_date: 'asc' }, { created_at: 'asc' }],
  });

  // Move null-expiry batches to the end (Prisma sorts nulls first in asc)
  const sorted = [
    ...activeBatches.filter((b) => b.expiry_date !== null),
    ...activeBatches.filter((b) => b.expiry_date === null),
  ];

  const totalAvailable = sorted.reduce((s, b) => s + Number(b.quantity), 0);
  const allocations: { batch_id: number; batch_no: string | null; expiry_date: Date | null; allocated_qty: number }[] = [];

  let remaining = neededQty;
  for (const batch of sorted) {
    if (remaining <= 0) break;
    const batchQty = Number(batch.quantity);
    const take = Math.min(remaining, batchQty);
    allocations.push({
      batch_id: batch.id,
      batch_no: batch.batch_no,
      expiry_date: batch.expiry_date,
      allocated_qty: take,
    });
    remaining -= take;
  }

  return {
    total_available: totalAvailable,
    allocations,
    shortage: Math.max(0, remaining),
  };
}

/**
 * Returns the aggregate available finished-goods stock for a product
 * by summing all StockTransaction records.
 */
async function getFinishedGoodsStock(tenantId: number, productId: number): Promise<number> {
  const result = await prisma.stockTransaction.aggregate({
    where: { tenant_id: tenantId, product_id: productId },
    _sum: { quantity: true },
  });
  return Number(result._sum.quantity ?? 0);
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /production/plans/preview
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Read-only calculation — NOTHING is written to the database.
 * Body: { product_id, buffer_qty? }
 */
export const previewProductionPlan = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id, buffer_qty = 0 } = req.body;

    if (!product_id) {
      return res.status(400).json({ message: 'product_id is required' });
    }

    const productId = Number(product_id);
    const bufferQty = Number(buffer_qty);

    // ── 1. Aggregate restaurant demand ────────────────────────────────────────
    const activeStatuses = ['DRAFT', 'SUBMITTED', 'ACCEPTED', 'MODIFIED', 'IN_PRODUCTION', 'READY', 'PARTIALLY_DISPATCHED'];
    const orderItems = await prisma.restaurantOrderItem.findMany({
      where: {
        product_id: productId,
        order: { tenant_id: tenantId, status: { in: activeStatuses }, deleted_at: null },
      },
      include: {
        order: {
          include: {
            restaurantTenant: {
              include: { restaurant: { select: { name: true } } },
            },
          },
        },
      },
    });

    // Group by restaurant
    const restaurantDemandMap = new Map<string, { restaurant_name: string; quantity: number }>();
    for (const item of orderItems) {
      const name = item.order.restaurantTenant.restaurant.name;
      const existing = restaurantDemandMap.get(name) ?? { restaurant_name: name, quantity: 0 };
      existing.quantity += Number(item.quantity);
      restaurantDemandMap.set(name, existing);
    }
    const restaurantDemand = Array.from(restaurantDemandMap.values());
    const totalDemand = restaurantDemand.reduce((s, r) => s + r.quantity, 0);

    // ── 2. Finished goods stock ───────────────────────────────────────────────
    const finishedStock = await getFinishedGoodsStock(tenantId, productId);

    // ── 3. Required production ────────────────────────────────────────────────
    const requiredQty = Math.max(0, totalDemand + bufferQty - finishedStock);

    // ── 4. Load active recipe ─────────────────────────────────────────────────
    const recipe = await prisma.recipe.findFirst({
      where: { product_id: productId, is_active: true },
      include: {
        ingredients: {
          include: {
            rawMaterial: { include: { unit: true } },
            unit: true,
          },
        },
      },
    });

    if (!recipe) {
      return res.status(200).json({
        restaurant_demand: restaurantDemand,
        total_demand: totalDemand,
        buffer_qty: bufferQty,
        finished_stock: finishedStock,
        required_qty: requiredQty,
        has_recipe: false,
        raw_material_requirements: [],
        summary: { total: 0, available: 0, short: 0 },
      });
    }

    // ── 5. Scale ingredients ──────────────────────────────────────────────────
    const scaleFactor = requiredQty / Number(recipe.base_quantity);

    // ── 6. Simulate FEFO allocation per ingredient ────────────────────────────
    const rawMaterialRequirements = await Promise.all(
      recipe.ingredients.map(async (ing) => {
        const scaledQty = Number(ing.quantity) * scaleFactor;
        const fefo = await simulateFEFOAllocation(tenantId, ing.raw_material_id, scaledQty);

        return {
          raw_material_id: ing.raw_material_id,
          raw_material_name: ing.rawMaterial.name,
          unit_symbol: ing.unit?.symbol ?? ing.rawMaterial.unit?.symbol ?? '',
          required_qty: scaledQty,
          available_qty: fefo.total_available,
          shortage: fefo.shortage,
          status: fefo.shortage > 0 ? 'short' : 'enough',
          purchase_needed_qty: fefo.shortage,
          fefo_allocations: fefo.allocations,
        };
      })
    );

    const summary = {
      total: rawMaterialRequirements.length,
      available: rawMaterialRequirements.filter((r) => r.status === 'enough').length,
      short: rawMaterialRequirements.filter((r) => r.status === 'short').length,
    };

    return res.status(200).json({
      restaurant_demand: restaurantDemand,
      total_demand: totalDemand,
      buffer_qty: bufferQty,
      finished_stock: finishedStock,
      required_qty: requiredQty,
      has_recipe: true,
      recipe_id: recipe.id,
      raw_material_requirements: rawMaterialRequirements,
      summary,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /production/plans
// Saves a Draft Production Plan with its items and raw material requirements.
// ──────────────────────────────────────────────────────────────────────────────
export const createProductionPlan = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const user = getUser(req);
    const { product_id, buffer_qty = 0, plan_date } = req.body;

    if (!product_id) {
      return res.status(400).json({ message: 'product_id is required' });
    }

    const productId = Number(product_id);
    const bufferQty = Number(buffer_qty);

    // ── Re-run calculations ───────────────────────────────────────────────────
    const activeStatuses = ['DRAFT', 'SUBMITTED', 'ACCEPTED', 'MODIFIED', 'IN_PRODUCTION', 'READY', 'PARTIALLY_DISPATCHED'];
    const orderItems = await prisma.restaurantOrderItem.findMany({
      where: {
        product_id: productId,
        order: { tenant_id: tenantId, status: { in: activeStatuses }, deleted_at: null },
      },
    });

    const totalDemand = orderItems.reduce((s, i) => s + Number(i.quantity), 0);
    const finishedStock = await getFinishedGoodsStock(tenantId, productId);
    const requiredQty = Math.max(0, totalDemand + bufferQty - finishedStock);

    const recipe = await prisma.recipe.findFirst({
      where: { product_id: productId, is_active: true },
      include: { ingredients: true },
    });

    if (!recipe) {
      return res.status(400).json({ message: 'No active recipe found for this product' });
    }

    const scaleFactor = requiredQty > 0 ? requiredQty / Number(recipe.base_quantity) : 0;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the production plan
      const plan = await tx.productionPlan.create({
        data: {
          tenant_id: tenantId,
          plan_date: plan_date ? new Date(plan_date) : new Date(),
          status: 'draft',
          created_by_id: user.id,
        },
      });

      // 2. Create the plan item
      await tx.productionPlanItem.create({
        data: {
          plan_id: plan.id,
          product_id: productId,
          total_orders_qty: new Prisma.Decimal(totalDemand),
          buffer_qty: new Prisma.Decimal(bufferQty),
          current_stock_qty: new Prisma.Decimal(finishedStock),
          production_qty: new Prisma.Decimal(requiredQty),
          status: 'pending',
        },
      });

      // 3. Create raw material requirements
      const requirementData = recipe.ingredients.map((ing) => ({
        tenant_id: tenantId,
        production_plan_id: plan.id,
        raw_material_id: ing.raw_material_id,
        required_qty: new Prisma.Decimal(Number(ing.quantity) * scaleFactor),
        available_qty: new Prisma.Decimal(0), // will be recomputed during material check
        purchase_needed_qty: new Prisma.Decimal(0),
      }));

      // Compute available and purchase_needed per ingredient
      for (const req_row of requirementData) {
        const now = new Date();
        const batches = await tx.inventoryBatch.findMany({
          where: {
            tenant_id: tenantId,
            raw_material_id: req_row.raw_material_id,
            quantity: { gt: 0 },
            OR: [{ expiry_date: null }, { expiry_date: { gt: now } }],
          },
        });
        const available = batches.reduce((s, b) => s + Number(b.quantity), 0);
        req_row.available_qty = new Prisma.Decimal(available);
        req_row.purchase_needed_qty = new Prisma.Decimal(Math.max(0, Number(req_row.required_qty) - available));
      }

      await tx.rawMaterialRequirement.createMany({ data: requirementData });

      return plan;
    });

    return res.status(201).json({ message: 'Production plan created', plan_id: result.id });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// GET /production/plans
// ──────────────────────────────────────────────────────────────────────────────
export const listProductionPlans = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const plans = await prisma.productionPlan.findMany({
      where: { tenant_id: tenantId },
      include: {
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        items: {
          include: { product: { select: { product_name: true, unit: { select: { symbol: true } } } } },
        },
        requirements: {
          include: { rawMaterial: { select: { name: true, unit: { select: { symbol: true } } } } },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return res.status(200).json({ plans });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// GET /production/plans/:id
// ──────────────────────────────────────────────────────────────────────────────
export const getProductionPlan = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);

    const plan = await prisma.productionPlan.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        items: {
          include: { product: { include: { unit: true } } },
        },
        requirements: {
          include: {
            rawMaterial: { include: { unit: true } },
            purchase_requests: true,
          },
        },
      },
    });

    if (!plan) return res.status(404).json({ message: 'Production plan not found' });
    return res.status(200).json({ plan });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /production/plans/:id/material-request
// Generates PurchaseRequest records for all shortage items.
// Sets plan status to 'material_check_completed'.
// ──────────────────────────────────────────────────────────────────────────────
export const generateMaterialRequest = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const user = getUser(req);
    const planId = Number(req.params.id);

    const plan = await prisma.productionPlan.findFirst({
      where: { id: planId, tenant_id: tenantId },
      include: { requirements: true },
    });

    if (!plan) return res.status(404).json({ message: 'Production plan not found' });
    if (!['draft', 'material_check_completed'].includes(plan.status)) {
      return res.status(400).json({ message: 'Material requests can only be generated from a draft or material-check-completed plan' });
    }

    const shortages = plan.requirements.filter((r) => Number(r.purchase_needed_qty) > 0);
    if (shortages.length === 0) {
      // All materials available — mark as ready
      await prisma.productionPlan.update({
        where: { id: planId },
        data: { status: 'ready_for_production' },
      });
      return res.status(200).json({ message: 'All materials available. Plan marked as Ready For Production.', requests_created: 0 });
    }

    await prisma.$transaction(async (tx) => {
      for (const req_row of shortages) {
        // Auto-generate a request number
        const requestNumber = `MR-${planId}-${req_row.raw_material_id}-${Date.now()}`;

        const existing = await tx.purchaseRequest.findFirst({
          where: {
            tenant_id: tenantId,
            raw_material_requirement_id: req_row.id,
            status: 'pending',
          },
        });

        if (!existing) {
          await tx.purchaseRequest.create({
            data: {
              tenant_id: tenantId,
              request_number: requestNumber,
              raw_material_requirement_id: req_row.id,
              requested_by: user.username,
              status: 'pending',
            },
          });
        }
      }

      await tx.productionPlan.update({
        where: { id: planId },
        data: { status: 'material_check_completed' },
      });
    });

    return res.status(200).json({
      message: 'Material requests generated successfully',
      requests_created: shortages.length,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /production/plans/:id/start
// THIS IS THE ONLY PLACE WHERE INVENTORY IS DEDUCTED.
// ──────────────────────────────────────────────────────────────────────────────
export const startProduction = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const user = getUser(req);
    const planId = Number(req.params.id);

    const plan = await prisma.productionPlan.findFirst({
      where: { id: planId, tenant_id: tenantId },
      include: {
        items: true,
        requirements: {
          include: { rawMaterial: { include: { unit: true } } },
        },
      },
    });

    if (!plan) return res.status(404).json({ message: 'Production plan not found' });
    if (plan.status !== 'ready_for_production') {
      return res.status(400).json({
        message: `Plan must be in 'ready_for_production' status to start. Current status: ${plan.status}`,
      });
    }

    // Re-check that all materials are available (snapshot check)
    const now = new Date();
    for (const req_row of plan.requirements) {
      const batches = await prisma.inventoryBatch.findMany({
        where: {
          tenant_id: tenantId,
          raw_material_id: req_row.raw_material_id,
          quantity: { gt: 0 },
          OR: [{ expiry_date: null }, { expiry_date: { gt: now } }],
        },
      });
      const available = batches.reduce((s, b) => s + Number(b.quantity), 0);
      if (available < Number(req_row.required_qty)) {
        return res.status(400).json({
          message: `Insufficient stock for: ${req_row.rawMaterial.name}. Required: ${req_row.required_qty}, Available: ${available.toFixed(2)}`,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      // ── Deduct raw materials via FEFO ─────────────────────────────────────
      for (const req_row of plan.requirements) {
        let remaining = Number(req_row.required_qty);

        const batches = await tx.inventoryBatch.findMany({
          where: {
            tenant_id: tenantId,
            raw_material_id: req_row.raw_material_id,
            quantity: { gt: 0 },
            OR: [{ expiry_date: null }, { expiry_date: { gt: now } }],
          },
          orderBy: [{ expiry_date: 'asc' }, { created_at: 'asc' }],
        });

        // Move null-expiry batches to end
        const sorted = [
          ...batches.filter((b) => b.expiry_date !== null),
          ...batches.filter((b) => b.expiry_date === null),
        ];

        for (const batch of sorted) {
          if (remaining <= 0) break;
          const batchQty = Number(batch.quantity);
          const deduct = Math.min(remaining, batchQty);

          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: { quantity: new Prisma.Decimal(batchQty - deduct) },
          });

          await tx.stockTransaction.create({
            data: {
              tenant_id: tenantId,
              raw_material_id: req_row.raw_material_id,
              inventory_batch_id: batch.id,
              transaction_type: 'production_consumption',
              quantity: new Prisma.Decimal(-deduct),
              reference_type: 'production_plan',
              reference_id: planId,
              remarks: `Production Plan #${planId} — consumed from Batch ${batch.batch_no ?? batch.id} (FEFO)`,
              created_by: user.username,
            },
          });

          remaining -= deduct;
        }
      }

      // ── Add finished goods stock ─────────────────────────────────────────
      for (const item of plan.items) {
        await tx.stockTransaction.create({
          data: {
            tenant_id: tenantId,
            product_id: item.product_id,
            transaction_type: 'production_output',
            quantity: new Prisma.Decimal(Number(item.production_qty)),
            reference_type: 'production_plan',
            reference_id: planId,
            remarks: `Production Plan #${planId} — finished goods output`,
            created_by: user.username,
          },
        });
      }

      // ── Update plan status ───────────────────────────────────────────────
      await tx.productionPlan.update({
        where: { id: planId },
        data: { status: 'completed', approved_by_id: user.id, updated_at: new Date() },
      });

      // ── Update plan items ────────────────────────────────────────────────
      await tx.productionPlanItem.updateMany({
        where: { plan_id: planId },
        data: { status: 'completed' },
      });
    });

    return res.status(200).json({ message: 'Production started successfully. Inventory has been updated.' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /production/plans/:id/mark-ready
// Manually mark a plan as ready_for_production (when all purchases completed)
// ──────────────────────────────────────────────────────────────────────────────
export const markPlanReady = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const planId = Number(req.params.id);

    const plan = await prisma.productionPlan.findFirst({
      where: { id: planId, tenant_id: tenantId },
      include: { requirements: true },
    });

    if (!plan) return res.status(404).json({ message: 'Production plan not found' });

    // Re-check availability
    const now = new Date();
    const shortages: string[] = [];

    for (const req_row of plan.requirements) {
      const batches = await prisma.inventoryBatch.findMany({
        where: {
          tenant_id: tenantId,
          raw_material_id: req_row.raw_material_id,
          quantity: { gt: 0 },
          OR: [{ expiry_date: null }, { expiry_date: { gt: now } }],
        },
      });
      const available = batches.reduce((s, b) => s + Number(b.quantity), 0);

      // Update the stored availability
      await prisma.rawMaterialRequirement.update({
        where: { id: req_row.id },
        data: {
          available_qty: new Prisma.Decimal(available),
          purchase_needed_qty: new Prisma.Decimal(Math.max(0, Number(req_row.required_qty) - available)),
        },
      });

      if (available < Number(req_row.required_qty)) {
        shortages.push(`Insufficient stock for raw material ID ${req_row.raw_material_id}`);
      }
    }

    if (shortages.length > 0) {
      return res.status(400).json({ message: 'Some materials are still short', shortages });
    }

    await prisma.productionPlan.update({
      where: { id: planId },
      data: { status: 'ready_for_production' },
    });

    return res.status(200).json({ message: 'Plan marked as Ready For Production' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};
