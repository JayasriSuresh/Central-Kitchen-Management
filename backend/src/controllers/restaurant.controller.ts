import { Request, Response } from 'express';
import prisma from '../utils/prisma';

// Helper to get tenantId and restaurantId from auth middleware
const getTenantId = (req: Request): number => {
  const tenantId = (req as any).tenantId;
  if (!tenantId) throw new Error('Central Kitchen tenant scope is required');
  return tenantId;
};
const getRestaurantId = (req: Request): number | null => {
  const user = (req as any).user;
  return user?.restaurant_id ? Number(user.restaurant_id) : null;
};

// ─── GET /restaurant/products ──────────────────────────────────────────────────
export const listProductsForOrdering = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const products = await prisma.product.findMany({
      where: { tenant_id: tenantId, status: 'active', deleted_at: null },
      include: {
        category: { select: { name: true } },
        unit: { select: { name: true, symbol: true } },
      },
      orderBy: { product_name: 'asc' },
    });

    const result = products.map((p) => {
      let meta: any = {};
      try { meta = JSON.parse(p.sku ?? '{}'); } catch { /* no-op */ }
      return {
        id: p.id,
        product_name: p.product_name,
        code: p.code,
        category_name: p.category?.name ?? 'General',
        unit_name: p.unit?.symbol ?? 'pcs',
        selling_price: p.selling_price,
        tax_percent: p.tax_percent,
        moq: p.moq,
        batch_size: p.batch_size,
        shelf_life_days: p.shelf_life_days,
        order_cutoff_hours: p.order_cutoff_hours,
        lead_time_days: p.lead_time_days,
        allow_urgent_order: p.allow_urgent_order,
        description: meta.description ?? '',
        image: meta.image ?? '',
      };
    });

    return res.status(200).json({ products: result });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── POST /restaurant/orders ───────────────────────────────────────────────────
export const placeOrder = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const restaurantId = getRestaurantId(req);
    const user = (req as any).user;

    if (!restaurantId) {
      return res.status(403).json({ message: 'Only users assigned to a restaurant can place orders.' });
    }

    const { delivery_date, remarks, is_urgent, items } = req.body;
    if (!delivery_date || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'delivery_date and items array are required.' });
    }

    // Resolve RestaurantTenant
    const rt = await prisma.restaurantTenant.findFirst({
      where: { tenant_id: tenantId, restaurant_id: restaurantId, deleted_at: null },
    });
    if (!rt) {
      return res.status(400).json({ message: 'Restaurant settings not found for this tenant.' });
    }

    const delDate = new Date(delivery_date);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create order header
      const order_number = `ORD-${Date.now()}`;
      const order = await tx.restaurantOrder.create({
        data: {
          tenant_id: tenantId,
          order_number,
          restaurant_tenant_id: rt.id,
          delivery_date: delDate,
          status: 'SUBMITTED',
          is_urgent: is_urgent === true || is_urgent === 'true',
          remarks: remarks ?? null,
          created_by: user.user_id,
        },
      });

      // 2. Create order items
      const orderItemsData = [];
      for (const item of items) {
        const prod = await tx.product.findFirst({
          where: { id: Number(item.product_id), tenant_id: tenantId, deleted_at: null },
        });
        if (!prod) {
          throw new Error(`Product ID ${item.product_id} not found.`);
        }

        // Calculate edit cutoff: delivery date minus product cutoff hours
        const cutoffTime = new Date(delDate.getTime() - prod.order_cutoff_hours * 60 * 60 * 1000);
        const qty = Number(item.quantity);
        const price = Number(prod.selling_price);
        const totalPrice = qty * price;

        orderItemsData.push({
          order_id: order.id,
          product_id: prod.id,
          quantity: qty,
          unit_price: price,
          total_price: totalPrice,
          edit_cutoff_at: cutoffTime,
        });
      }

      await tx.restaurantOrderItem.createMany({ data: orderItemsData });

      return order;
    });

    return res.status(201).json({ message: 'Order placed successfully', order: result });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// ─── GET /restaurant/orders ────────────────────────────────────────────────────
export const listOrderHistory = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const restaurantId = getRestaurantId(req);

    if (!restaurantId) {
      return res.status(403).json({ message: 'Only users assigned to a restaurant can view orders.' });
    }

    const rt = await prisma.restaurantTenant.findFirst({
      where: { tenant_id: tenantId, restaurant_id: restaurantId, deleted_at: null },
    });
    if (!rt) return res.status(200).json({ orders: [] });

    const orders = await prisma.restaurantOrder.findMany({
      where: { tenant_id: tenantId, restaurant_tenant_id: rt.id, deleted_at: null },
      include: {
        items: {
          include: {
            product: { select: { product_name: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const result = orders.map((o) => {
      const itemsVal = o.items.map((i) => ({
        id: i.id,
        product_name: i.product.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total_price: i.total_price,
        edit_cutoff_at: i.edit_cutoff_at,
      }));
      const totalAmount = itemsVal.reduce((sum, item) => sum + Number(item.total_price), 0);

      return {
        id: o.id,
        order_number: o.order_number,
        delivery_date: o.delivery_date,
        status: o.status,
        is_urgent: o.is_urgent,
        remarks: o.remarks,
        created_at: o.created_at,
        items: itemsVal,
        total_amount: totalAmount,
      };
    });

    return res.status(200).json({ orders: result });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};
