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
// VENDORS
// ──────────────────────────────────────────────────────────────────────────────

// GET /purchase/vendors
export const listVendors = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const vendors = await prisma.vendor.findMany({
      where: { tenant_id: tenantId, deleted_at: null, status: 'active' },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json({ vendors });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// POST /purchase/vendors
export const createVendor = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { name, contact_number, gst_number, payment_terms, address } = req.body;

    if (!name) return res.status(400).json({ message: 'Vendor name is required' });

    const vendor = await prisma.vendor.create({
      data: { tenant_id: tenantId, name, contact_number, gst_number, payment_terms, address },
    });
    return res.status(201).json({ vendor });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// PURCHASE REQUESTS
// ──────────────────────────────────────────────────────────────────────────────

// GET /purchase/requests
export const listPurchaseRequests = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { status } = req.query;

    const requests = await prisma.purchaseRequest.findMany({
      where: {
        tenant_id: tenantId,
        ...(status ? { status: status as string } : {}),
      },
      include: {
        requirement: {
          include: {
            rawMaterial: { include: { unit: true } },
            plan: {
              include: {
                items: {
                  include: { product: { select: { product_name: true } } },
                },
              },
            },
          },
        },
        purchaseOrders: {
          select: { id: true, po_number: true, status: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return res.status(200).json({ requests });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// POST /purchase/requests/:id/approve
export const approvePurchaseRequest = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const user = getUser(req);
    const requestId = Number(req.params.id);
    const { vendor_id, unit_price, modified_qty, expected_delivery_date } = req.body;

    if (!vendor_id || !unit_price) {
      return res.status(400).json({ message: 'vendor_id and unit_price are required' });
    }

    const purchaseRequest = await prisma.purchaseRequest.findFirst({
      where: { id: requestId, tenant_id: tenantId },
      include: { requirement: true },
    });

    if (!purchaseRequest) {
      return res.status(404).json({ message: 'Purchase request not found' });
    }
    if (purchaseRequest.status !== 'pending') {
      return res.status(400).json({ message: `Request is already ${purchaseRequest.status}` });
    }

    const orderedQty = modified_qty
      ? Number(modified_qty)
      : Number(purchaseRequest.requirement.purchase_needed_qty);

    const totalPrice = orderedQty * Number(unit_price);

    const result = await prisma.$transaction(async (tx) => {
      // Generate PO number
      const count = await tx.purchaseOrder.count({ where: { tenant_id: tenantId } });
      const poNumber = `PO-${tenantId}-${String(count + 1).padStart(4, '0')}`;

      // Create the PO
      const po = await tx.purchaseOrder.create({
        data: {
          tenant_id: tenantId,
          po_number: poNumber,
          vendor_id: Number(vendor_id),
          purchase_request_id: purchaseRequest.id,
          status: 'created',
          expected_delivery_date: expected_delivery_date ? new Date(expected_delivery_date) : null,
          total_amount: new Prisma.Decimal(totalPrice),
          created_by_id: user.id,
        },
      });

      // Create PO items
      await tx.purchaseOrderItem.create({
        data: {
          po_id: po.id,
          raw_material_id: purchaseRequest.requirement.raw_material_id,
          ordered_qty: new Prisma.Decimal(orderedQty),
          received_qty: new Prisma.Decimal(0),
          unit_price: new Prisma.Decimal(unit_price),
          total_price: new Prisma.Decimal(totalPrice),
          created_by: user.username,
        },
      });

      // Update request status
      await tx.purchaseRequest.update({
        where: { id: requestId },
        data: { status: 'approved' },
      });

      return po;
    });

    return res.status(200).json({ message: 'Purchase request approved. Purchase Order created.', po_id: result.id });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// POST /purchase/requests/:id/reject
export const rejectPurchaseRequest = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const requestId = Number(req.params.id);

    const purchaseRequest = await prisma.purchaseRequest.findFirst({
      where: { id: requestId, tenant_id: tenantId },
    });

    if (!purchaseRequest) return res.status(404).json({ message: 'Purchase request not found' });
    if (purchaseRequest.status !== 'pending') {
      return res.status(400).json({ message: `Request is already ${purchaseRequest.status}` });
    }

    await prisma.purchaseRequest.update({
      where: { id: requestId },
      data: { status: 'rejected' },
    });

    return res.status(200).json({ message: 'Purchase request rejected' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// PURCHASE ORDERS
// ──────────────────────────────────────────────────────────────────────────────

// GET /purchase/orders
export const listPurchaseOrders = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const orders = await prisma.purchaseOrder.findMany({
      where: { tenant_id: tenantId },
      include: {
        vendor: { select: { name: true } },
        createdBy: { select: { name: true } },
        items: {
          include: {
            rawMaterial: { include: { unit: true } },
          },
        },
        goods_received_notes: true,
      },
      orderBy: { created_at: 'desc' },
    });
    return res.status(200).json({ orders });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// GOODS RECEIVED NOTE — THIS IS WHERE STOCK IS ADDED AFTER PURCHASING
// ──────────────────────────────────────────────────────────────────────────────

// POST /purchase/orders/:id/grn
export const createGRN = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const user = getUser(req);
    const poId = Number(req.params.id);
    const { notes, received_date, items } = req.body;
    // items: [{ raw_material_id, received_qty, batch_no, manufactured_date, expiry_date, purchase_price }]

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items array is required' });
    }

    const po = await prisma.purchaseOrder.findFirst({
      where: { id: poId, tenant_id: tenantId },
      include: { items: true },
    });

    if (!po) return res.status(404).json({ message: 'Purchase order not found' });
    if (po.status === 'received') {
      return res.status(400).json({ message: 'All items have already been received' });
    }

    await prisma.$transaction(async (tx) => {
      // Create the GRN header
      const grn = await tx.goodsReceivedNote.create({
        data: {
          tenant_id: tenantId,
          po_id: poId,
          received_date: received_date ? new Date(received_date) : new Date(),
          received_by_id: user.id,
          notes: notes || null,
        },
      });

      for (const grn_item of items) {
        const receivedQty = Number(grn_item.received_qty);
        if (receivedQty <= 0) continue;

        const rawMaterialId = Number(grn_item.raw_material_id);
        const batchNo = grn_item.batch_no || `GRN-${grn.id}-${rawMaterialId}-${Date.now()}`;
        const purchasePrice = Number(grn_item.purchase_price ?? 0);

        // Create inventory batch
        const batch = await tx.inventoryBatch.create({
          data: {
            tenant_id: tenantId,
            raw_material_id: rawMaterialId,
            batch_no: batchNo,
            quantity: new Prisma.Decimal(receivedQty),
            original_quantity: new Prisma.Decimal(receivedQty),
            purchase_price: new Prisma.Decimal(purchasePrice),
            manufactured_date: grn_item.manufactured_date ? new Date(grn_item.manufactured_date) : null,
            expiry_date: grn_item.expiry_date ? new Date(grn_item.expiry_date) : null,
            supplier: po ? undefined : null,
            remarks: `GRN #${grn.id} — PO #${po.po_number}`,
          },
        });

        // Create inward stock transaction
        await tx.stockTransaction.create({
          data: {
            tenant_id: tenantId,
            raw_material_id: rawMaterialId,
            inventory_batch_id: batch.id,
            transaction_type: 'inward',
            quantity: new Prisma.Decimal(receivedQty),
            reference_type: 'purchase_order',
            reference_id: poId,
            remarks: `GRN received: Batch ${batchNo}, PO ${po.po_number}`,
            created_by: user.username,
          },
        });

        // Update PO item received_qty
        const poItem = po.items.find((i) => i.raw_material_id === rawMaterialId);
        if (poItem) {
          const newReceivedQty = Number(poItem.received_qty) + receivedQty;
          await tx.purchaseOrderItem.update({
            where: { id: poItem.id },
            data: { received_qty: new Prisma.Decimal(newReceivedQty) },
          });
        }
      }

      // Update PO status
      const updatedItems = await tx.purchaseOrderItem.findMany({ where: { po_id: poId } });
      const allReceived = updatedItems.every(
        (i) => Number(i.received_qty) >= Number(i.ordered_qty)
      );
      const anyReceived = updatedItems.some((i) => Number(i.received_qty) > 0);

      await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: allReceived ? 'received' : anyReceived ? 'partially_received' : 'created',
        },
      });
    });

    // Auto-check if any production plans can now be marked ready
    // (background check — fire-and-forget style)
    autoCheckProductionPlansReadiness(tenantId).catch(() => {});

    return res.status(201).json({ message: 'Goods received. Inventory updated successfully.' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * After a GRN, automatically re-evaluate production plans in
 * 'material_check_completed' state to see if they can be marked ready.
 */
async function autoCheckProductionPlansReadiness(tenantId: number) {
  const plans = await prisma.productionPlan.findMany({
    where: { tenant_id: tenantId, status: 'material_check_completed' },
    include: { requirements: true },
  });

  const now = new Date();

  for (const plan of plans) {
    let allAvailable = true;

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

      await prisma.rawMaterialRequirement.update({
        where: { id: req_row.id },
        data: {
          available_qty: new Prisma.Decimal(available),
          purchase_needed_qty: new Prisma.Decimal(Math.max(0, Number(req_row.required_qty) - available)),
        },
      });

      if (available < Number(req_row.required_qty)) {
        allAvailable = false;
      }
    }

    if (allAvailable) {
      await prisma.productionPlan.update({
        where: { id: plan.id },
        data: { status: 'ready_for_production' },
      });
    }
  }
}
