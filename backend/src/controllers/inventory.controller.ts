import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { adjustStock } from '../services/inventory.service';
import { Prisma } from '@prisma/client';

const getTenantId = (req: Request): number => {
  const tenantId = (req as any).tenantId;
  if (!tenantId) throw new Error('Central Kitchen tenant scope is required');
  return tenantId;
};
const getCreatedBy = (req: Request): string => (req as any).user?.username || 'system';

// ─── RAW MATERIALS MASTER (CRUD) ──────────────────────────────────────────────

// GET /inventory/raw-materials
export const listRawMaterials = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const rawMaterials = await prisma.rawMaterial.findMany({
      where: { tenant_id: tenantId, deleted_at: null },
      include: { unit: true },
      orderBy: { name: 'asc' }
    });

    return res.status(200).json({ rawMaterials });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// POST /inventory/raw-materials
export const createRawMaterial = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { name, category, unit_id, reorder_level, standard_price, status } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const rawMaterial = await prisma.rawMaterial.create({
      data: {
        tenant_id: tenantId,
        name,
        category: category || null,
        unit_id: unit_id ? Number(unit_id) : null,
        reorder_level: reorder_level ? new Prisma.Decimal(reorder_level) : null,
        standard_price: standard_price ? new Prisma.Decimal(standard_price) : null,
        status: status || 'active'
      },
      include: { unit: true }
    });

    return res.status(201).json({ message: 'Raw material created successfully', rawMaterial });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// PUT /inventory/raw-materials/:id
export const updateRawMaterial = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const { name, category, unit_id, reorder_level, standard_price, status } = req.body;

    const existing = await prisma.rawMaterial.findFirst({
      where: { id, tenant_id: tenantId, deleted_at: null }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Raw material not found' });
    }

    const rawMaterial = await prisma.rawMaterial.update({
      where: { id },
      data: {
        ...(name && { name }),
        category: category !== undefined ? category : existing.category,
        unit_id: unit_id !== undefined ? (unit_id ? Number(unit_id) : null) : existing.unit_id,
        reorder_level: reorder_level !== undefined ? (reorder_level ? new Prisma.Decimal(reorder_level) : null) : existing.reorder_level,
        standard_price: standard_price !== undefined ? (standard_price ? new Prisma.Decimal(standard_price) : null) : existing.standard_price,
        status: status || existing.status
      },
      include: { unit: true }
    });

    return res.status(200).json({ message: 'Raw material updated successfully', rawMaterial });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// DELETE /inventory/raw-materials/:id (soft delete)
export const deleteRawMaterial = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);

    const existing = await prisma.rawMaterial.findFirst({
      where: { id, tenant_id: tenantId, deleted_at: null }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Raw material not found' });
    }

    await prisma.rawMaterial.update({
      where: { id },
      data: { deleted_at: new Date(), status: 'inactive' }
    });

    return res.status(200).json({ message: 'Raw material deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── INVENTORY OPERATIONS & DASHBOARD ─────────────────────────────────────────

// GET /inventory/dashboard
export const getInventoryDashboard = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const now = new Date();

    // Fetch all raw materials
    const rawMaterials = await prisma.rawMaterial.findMany({
      where: { tenant_id: tenantId, deleted_at: null },
      include: { unit: true },
      orderBy: { name: 'asc' }
    });

    // Fetch all active, non-expired batches for aggregation
    const batches = await prisma.inventoryBatch.findMany({
      where: {
        tenant_id: tenantId,
        quantity: { gt: 0 },
        OR: [
          { expiry_date: null },
          { expiry_date: { gt: now } }
        ]
      }
    });

    // Aggregate statistics per raw material
    const dashboard = rawMaterials.map((rm) => {
      const rmBatches = batches.filter((b) => b.raw_material_id === rm.id);
      
      const availableQuantity = rmBatches.reduce((sum, b) => sum + Number(b.quantity), 0);
      const batchCount = rmBatches.length;
      
      // Determine if stock is low
      const reorderLevel = rm.reorder_level ? Number(rm.reorder_level) : 0;
      const isLowStock = availableQuantity < reorderLevel;

      // Find the closest expiry date
      const expiryDates = rmBatches
        .map((b) => b.expiry_date)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime());
      
      const nextExpiry = expiryDates.length > 0 ? expiryDates[0] : null;

      return {
        id: rm.id,
        name: rm.name,
        category: rm.category,
        unit: rm.unit?.symbol || '',
        availableQuantity,
        batchCount,
        isLowStock,
        reorderLevel,
        nextExpiry,
        standardPrice: rm.standard_price ? Number(rm.standard_price) : 0
      };
    });

    return res.status(200).json({ dashboard });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// GET /inventory/raw-materials/:id/batches
export const getRawMaterialBatches = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const rawMaterialId = Number(req.params.id);
    const now = new Date();

    const batches = await prisma.inventoryBatch.findMany({
      where: {
        tenant_id: tenantId,
        raw_material_id: rawMaterialId,
        quantity: { gt: 0 },
        OR: [
          { expiry_date: null },
          { expiry_date: { gt: now } }
        ]
      },
      orderBy: { created_at: 'asc' }
    });

    return res.status(200).json({ batches });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// POST /inventory/batches (Update Inventory)
export const updateInventory = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const username = getCreatedBy(req);
    const {
      raw_material_id,
      quantity,
      purchase_price,
      batch_no,
      manufactured_date,
      expiry_date,
      supplier,
      remarks
    } = req.body;

    if (!raw_material_id || quantity === undefined || purchase_price === undefined) {
      return res.status(400).json({ message: 'raw_material_id, quantity, and purchase_price are required.' });
    }

    const rm = await prisma.rawMaterial.findFirst({
      where: { id: Number(raw_material_id), tenant_id: tenantId, deleted_at: null }
    });

    if (!rm) {
      return res.status(404).json({ message: 'Raw material not found.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const generatedBatchNo = batch_no || `BAT-${Date.now()}`;
      
      const batch = await tx.inventoryBatch.create({
        data: {
          tenant_id: tenantId,
          raw_material_id: Number(raw_material_id),
          batch_no: generatedBatchNo,
          quantity: new Prisma.Decimal(quantity),
          original_quantity: new Prisma.Decimal(quantity),
          purchase_price: new Prisma.Decimal(purchase_price),
          manufactured_date: manufactured_date ? new Date(manufactured_date) : null,
          expiry_date: expiry_date ? new Date(expiry_date) : null,
          supplier: supplier || null,
          remarks: remarks || null
        }
      });

      const transaction = await tx.stockTransaction.create({
        data: {
          tenant_id: tenantId,
          raw_material_id: Number(raw_material_id),
          inventory_batch_id: batch.id,
          transaction_type: 'inward',
          quantity: new Prisma.Decimal(quantity),
          remarks: remarks || `Inventory added: Batch #${generatedBatchNo}`,
          created_by: username
        }
      });

      return { batch, transaction };
    });

    return res.status(201).json({
      message: 'Inventory batch added successfully.',
      batch: result.batch
    });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// POST /inventory/adjustments
export const adjustStockEndpoint = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const username = getCreatedBy(req);
    const { raw_material_id, quantity, reason, remarks } = req.body;

    if (!raw_material_id || quantity === undefined || !reason) {
      return res.status(400).json({ message: 'raw_material_id, quantity, and reason are required.' });
    }

    const numericRawMaterialId = Number(raw_material_id);
    const numericQuantity = Number(quantity);

    if (numericQuantity === 0) {
      return res.status(400).json({ message: 'Adjustment quantity cannot be zero.' });
    }

    await prisma.$transaction(async (tx) => {
      await adjustStock(
        tx,
        tenantId,
        numericRawMaterialId,
        numericQuantity,
        reason,
        remarks || '',
        username
      );
    });

    return res.status(200).json({ message: 'Stock adjusted successfully.' });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// GET /inventory/raw-materials/:id/history
export const getRawMaterialHistory = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const rawMaterialId = Number(req.params.id);

    const rm = await prisma.rawMaterial.findFirst({
      where: { id: rawMaterialId, tenant_id: tenantId, deleted_at: null }
    });

    if (!rm) {
      return res.status(404).json({ message: 'Raw material not found.' });
    }

    const transactions = await prisma.stockTransaction.findMany({
      where: {
        tenant_id: tenantId,
        raw_material_id: rawMaterialId
      },
      orderBy: { created_at: 'desc' }
    });

    // Calculate running balance by playing the transaction history chronologically
    const chronologicalTx = [...transactions].reverse();
    let balance = 0;
    
    const history = chronologicalTx.map((tx) => {
      const change = Number(tx.quantity);
      balance += change;
      return {
        id: tx.id,
        created_at: tx.created_at,
        transaction_type: tx.transaction_type,
        quantity: change,
        balance,
        remarks: tx.remarks,
        created_by: tx.created_by
      };
    });

    // Return newest transactions first
    return res.status(200).json({ history: history.reverse() });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};
