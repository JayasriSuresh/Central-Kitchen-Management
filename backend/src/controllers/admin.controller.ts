import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { hashPassword, generateUserId, generateUsername, seedTenantRoles } from '../services/auth.service';
import { sendCredentialsEmail } from '../services/email.service';

// Helper: get tenantId from auth middleware
const getTenantId = (req: Request): number => (req as any).tenantId;

// ─── GET /admin/dropdown-data ─────────────────────────────────────────────────
export const getDropdownData = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const [roles, categories, units, rawMaterials] = await Promise.all([
      prisma.role.findMany({
        where: { tenant_id: tenantId, deleted_at: null },
        select: { id: true, name: true, code: true, type: true },
        orderBy: { code: 'asc' },
      }),
      prisma.productCategory.findMany({
        where: { tenant_id: tenantId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.unit.findMany({
        select: { id: true, name: true, symbol: true },
        orderBy: { name: 'asc' },
      }),
      prisma.rawMaterial.findMany({
        where: { tenant_id: tenantId, deleted_at: null },
        select: { id: true, name: true, category: true, unit_id: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return res.status(200).json({ roles, categories, units, rawMaterials });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── RESTAURANTS ──────────────────────────────────────────────────────────────

// GET /admin/restaurants
export const listRestaurants = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const tenants = await prisma.restaurantTenant.findMany({
      where: { tenant_id: tenantId, deleted_at: null },
      include: { restaurant: true },
      orderBy: { restaurant_no: 'asc' },
    });
    const result = tenants.map((rt) => ({
      id: rt.id,
      restaurant_id: rt.restaurant_id,
      restaurant_no: rt.restaurant_no,
      branch_code: rt.branch_code,
      contact_number: rt.contact_number,
      status: rt.status,
      name: rt.restaurant.name,
      address: rt.restaurant.address,
      gst_number: rt.restaurant.gst_number,
      email: (rt.restaurant as any).email ?? null,
    }));
    return res.status(200).json({ restaurants: result });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// POST /admin/restaurants
export const createRestaurant = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { name, address, gst_number, contact_number } = req.body;
    if (!name) return res.status(400).json({ message: 'Restaurant name is required' });

    const result = await prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: { name, address, gst_number, status: 'active' },
      });

      // Get next restaurant_no for this tenant
      const maxRt = await tx.restaurantTenant.aggregate({
        where: { tenant_id: tenantId },
        _max: { restaurant_no: true },
      });
      const restaurant_no = (maxRt._max.restaurant_no ?? 0) + 1;
      const branch_code = `BR-${String(restaurant_no).padStart(3, '0')}`;

      const rt = await tx.restaurantTenant.create({
        data: {
          tenant_id: tenantId,
          restaurant_id: restaurant.id,
          restaurant_no,
          branch_code,
          contact_number: contact_number ?? null,
          status: 'active',
        },
      });

      return { ...rt, name: restaurant.name, address: restaurant.address, gst_number: restaurant.gst_number };
    });

    return res.status(201).json({ message: 'Restaurant created successfully', restaurant: result });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// PUT /admin/restaurants/:id   (id = RestaurantTenant.id)
export const updateRestaurant = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const rtId = Number(req.params.id);
    const { name, address, gst_number, contact_number, status } = req.body;

    const rt = await prisma.restaurantTenant.findFirst({
      where: { id: rtId, tenant_id: tenantId, deleted_at: null },
    });
    if (!rt) return res.status(404).json({ message: 'Restaurant not found' });

    await prisma.$transaction(async (tx) => {
      if (name || address !== undefined || gst_number !== undefined) {
        await tx.restaurant.update({
          where: { id: rt.restaurant_id },
          data: {
            ...(name && { name }),
            ...(address !== undefined && { address }),
            ...(gst_number !== undefined && { gst_number }),
          },
        });
      }
      await tx.restaurantTenant.update({
        where: { id: rtId },
        data: {
          ...(contact_number !== undefined && { contact_number }),
          ...(status && { status }),
        },
      });
    });

    return res.status(200).json({ message: 'Restaurant updated successfully' });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// DELETE /admin/restaurants/:id   (soft delete)
export const deleteRestaurant = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const rtId = Number(req.params.id);

    const rt = await prisma.restaurantTenant.findFirst({
      where: { id: rtId, tenant_id: tenantId, deleted_at: null },
    });
    if (!rt) return res.status(404).json({ message: 'Restaurant not found' });

    await prisma.restaurantTenant.update({
      where: { id: rtId },
      data: { deleted_at: new Date() },
    });

    return res.status(200).json({ message: 'Restaurant deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── CK USERS ─────────────────────────────────────────────────────────────────

// GET /admin/users/ck
export const listCkUsers = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const users = await prisma.user.findMany({
      where: { tenant_id: tenantId, deleted_at: null },
      include: { primaryRole: { select: { name: true, type: true } } },
      orderBy: { created_at: 'desc' },
    });
    const result = users.map((u) => ({
      id: u.id,
      user_id: u.user_id,
      name: u.name,
      username: u.username,
      email: u.email,
      mobile: u.mobile,
      status: u.status,
      primary_role_id: u.primary_role_id,
      role_name: u.primaryRole?.name,
      role_type: u.primaryRole?.type,
      created_at: u.created_at,
    }));
    return res.status(200).json({ users: result });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// POST /admin/users/ck
export const createCkUser = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { name, email, mobile, role_id, password } = req.body;
    if (!name || !email || !mobile || !role_id || !password) {
      return res.status(400).json({ message: 'name, email, mobile, role_id, and password are required' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const user_id = await generateUserId(tx, tenantId, null, Number(role_id));
      const username = generateUsername(user_id);
      const password_hash = await hashPassword(password);

      const user = await tx.user.create({
        data: {
          tenant_id: tenantId,
          user_id,
          username,
          name,
          email,
          mobile,
          password_hash,
          primary_role_id: Number(role_id),
          status: 'active',
        },
      });

      await tx.userRole.create({ data: { user_id: user.id, role_id: Number(role_id) } });

      return { user, plainPassword: password };
    });

    // Send credentials via email (or logs to console on SMTP failure)
    await sendCredentialsEmail(result.user.email, result.user.name, result.user.username, result.plainPassword);

    return res.status(201).json({
      message: `User created. Credentials have been sent to ${result.user.email}.`,
      user: {
        id: result.user.id,
        user_id: result.user.user_id,
        username: result.user.username,
        name: result.user.name,
        email: result.user.email,
      },
    });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// PUT /admin/users/ck/:id
export const updateCkUser = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = Number(req.params.id);
    const { name, mobile, role_id, status } = req.body;

    const user = await prisma.user.findFirst({
      where: { id: userId, tenant_id: tenantId, deleted_at: null },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(name && { name }),
          ...(mobile && { mobile }),
          ...(status && { status }),
          ...(role_id && { primary_role_id: Number(role_id) }),
        },
      });

      if (role_id) {
        // Update the primary UserRole record
        const existingRole = await tx.userRole.findFirst({ where: { user_id: userId } });
        if (existingRole) {
          await tx.userRole.update({
            where: { id: existingRole.id },
            data: { role_id: Number(role_id) },
          });
        } else {
          await tx.userRole.create({ data: { user_id: userId, role_id: Number(role_id) } });
        }
      }
    });

    return res.status(200).json({ message: 'User updated successfully' });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// DELETE /admin/users/ck/:id   (soft delete)
export const deleteCkUser = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = Number(req.params.id);

    const user = await prisma.user.findFirst({
      where: { id: userId, tenant_id: tenantId, deleted_at: null },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    await prisma.user.update({
      where: { id: userId },
      data: { deleted_at: new Date(), status: 'inactive' },
    });

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── PRODUCTS ────────────────────────────────────────────────────────────────

// GET /admin/products
export const listProducts = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const products = await prisma.product.findMany({
      where: { tenant_id: tenantId, deleted_at: null },
      include: {
        category: { select: { name: true } },
        unit: { select: { name: true, symbol: true } },
        recipes: {
          where: { is_active: true },
          include: {
            ingredients: {
              include: {
                rawMaterial: { select: { name: true } },
                unit: { select: { name: true, symbol: true } },
              },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const result = products.map((p) => {
      let meta: any = {};
      try { meta = JSON.parse(p.sku ?? '{}'); } catch { /* no-op */ }
      return {
        id: p.id,
        product_name: p.product_name,
        code: p.code,
        category_id: p.category_id,
        category_name: p.category?.name,
        unit_id: p.unit_id,
        unit_name: p.unit?.symbol,
        selling_price: p.selling_price,
        tax_percent: p.tax_percent,
        moq: p.moq,
        batch_size: p.batch_size,
        shelf_life_days: p.shelf_life_days,
        order_cutoff_hours: p.order_cutoff_hours,
        lead_time_days: p.lead_time_days,
        allow_urgent_order: p.allow_urgent_order,
        status: p.status,
        description: meta.description ?? '',
        image: meta.image ?? '',
        cost_price: meta.cost_price ?? 0,
        recipe: p.recipes[0]?.ingredients.map((ing) => ({
          id: ing.id,
          recipe_id: ing.recipe_id,
          raw_material_id: ing.raw_material_id,
          raw_material_name: ing.rawMaterial.name,
          quantity: ing.quantity,
          unit_id: ing.unit_id,
          unit_name: ing.unit?.symbol,
        })) ?? [],
        recipe_id: p.recipes[0]?.id ?? null,
        recipe_version: p.recipes[0]?.version_no ?? null,
      };
    });

    return res.status(200).json({ products: result });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// POST /admin/products
export const createProduct = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const createdBy = (req as any).user?.user_id;
    const {
      product_name, description, image, cost_price,
      category_id, unit_id, moq, batch_size, selling_price, tax_percent,
      shelf_life_days, order_cutoff_hours, lead_time_days, allow_urgent_order,
      recipe,  // array: [{ raw_material_id, quantity, unit_id }]
    } = req.body;

    if (!product_name || selling_price === undefined) {
      return res.status(400).json({ message: 'product_name and selling_price are required' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Encode extra fields into sku
      const sku = JSON.stringify({ description: description ?? '', image: image ?? '', cost_price: cost_price ?? 0 });
      const code = `PROD-${Date.now()}`;

      const product = await tx.product.create({
        data: {
          tenant_id: tenantId,
          product_name,
          code,
          sku,
          category_id: category_id ? Number(category_id) : null,
          unit_id: unit_id ? Number(unit_id) : null,
          moq: moq ? Number(moq) : null,
          batch_size: batch_size ? Number(batch_size) : null,
          selling_price: Number(selling_price),
          tax_percent: Number(tax_percent ?? 0),
          shelf_life_days: shelf_life_days ? Number(shelf_life_days) : null,
          order_cutoff_hours: Number(order_cutoff_hours ?? 0),
          lead_time_days: Number(lead_time_days ?? 0),
          allow_urgent_order: allow_urgent_order !== false && allow_urgent_order !== 'false',
          created_by: createdBy,
        },
      });

      let recipeRecord = null;
      if (recipe && recipe.length > 0) {
        recipeRecord = await tx.recipe.create({
          data: {
            tenant_id: tenantId,
            product_id: product.id,
            version_no: 1,
            base_quantity: 1,
            is_active: true,
            created_by_id: (req as any).user?.id ?? null,
          },
        });

        await tx.recipeIngredient.createMany({
          data: recipe.map((r: any) => ({
            recipe_id: recipeRecord!.id,
            raw_material_id: Number(r.raw_material_id),
            quantity: Number(r.quantity),
            unit_id: r.unit_id ? Number(r.unit_id) : null,
          })),
        });
      }

      return product;
    });

    return res.status(201).json({ message: 'Product created successfully', product: result });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// PUT /admin/products/:id
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const productId = Number(req.params.id);
    const updatedBy = (req as any).user?.user_id;
    const {
      product_name, description, image, cost_price,
      category_id, unit_id, moq, batch_size, selling_price, tax_percent,
      shelf_life_days, order_cutoff_hours, lead_time_days, allow_urgent_order,
      status, recipe,
    } = req.body;

    const product = await prisma.product.findFirst({
      where: { id: productId, tenant_id: tenantId, deleted_at: null },
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Parse existing sku metadata and merge
    let meta: any = {};
    try { meta = JSON.parse(product.sku ?? '{}'); } catch { /* no-op */ }
    if (description !== undefined) meta.description = description;
    if (image !== undefined) meta.image = image;
    if (cost_price !== undefined) meta.cost_price = cost_price;

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          sku: JSON.stringify(meta),
          ...(product_name && { product_name }),
          ...(category_id !== undefined && { category_id: category_id ? Number(category_id) : null }),
          ...(unit_id !== undefined && { unit_id: unit_id ? Number(unit_id) : null }),
          ...(moq !== undefined && { moq: moq ? Number(moq) : null }),
          ...(batch_size !== undefined && { batch_size: batch_size ? Number(batch_size) : null }),
          ...(selling_price !== undefined && { selling_price: Number(selling_price) }),
          ...(tax_percent !== undefined && { tax_percent: Number(tax_percent) }),
          ...(shelf_life_days !== undefined && { shelf_life_days: shelf_life_days ? Number(shelf_life_days) : null }),
          ...(order_cutoff_hours !== undefined && { order_cutoff_hours: Number(order_cutoff_hours) }),
          ...(lead_time_days !== undefined && { lead_time_days: Number(lead_time_days) }),
          ...(allow_urgent_order !== undefined && { allow_urgent_order: allow_urgent_order !== false && allow_urgent_order !== 'false' }),
          ...(status && { status }),
          updated_by: updatedBy,
        },
      });

      // Update recipe: overwrite existing ingredients
      if (recipe !== undefined) {
        const existingRecipe = await tx.recipe.findFirst({
          where: { product_id: productId, is_active: true },
        });

        if (existingRecipe) {
          await tx.recipeIngredient.deleteMany({ where: { recipe_id: existingRecipe.id } });
          if (recipe.length > 0) {
            await tx.recipeIngredient.createMany({
              data: recipe.map((r: any) => ({
                recipe_id: existingRecipe.id,
                raw_material_id: Number(r.raw_material_id),
                quantity: Number(r.quantity),
                unit_id: r.unit_id ? Number(r.unit_id) : null,
              })),
            });
          }
        } else if (recipe.length > 0) {
          // Create a new recipe if none exists
          const lastRecipe = await tx.recipe.findFirst({
            where: { product_id: productId },
            orderBy: { version_no: 'desc' },
          });
          const newVersion = (lastRecipe?.version_no ?? 0) + 1;
          const newRecipe = await tx.recipe.create({
            data: {
              tenant_id: tenantId,
              product_id: productId,
              version_no: newVersion,
              base_quantity: 1,
              is_active: true,
            },
          });
          await tx.recipeIngredient.createMany({
            data: recipe.map((r: any) => ({
              recipe_id: newRecipe.id,
              raw_material_id: Number(r.raw_material_id),
              quantity: Number(r.quantity),
              unit_id: r.unit_id ? Number(r.unit_id) : null,
            })),
          });
        }
      }
    });

    return res.status(200).json({ message: 'Product updated successfully' });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// DELETE /admin/products/:id   (soft delete)
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const productId = Number(req.params.id);

    const product = await prisma.product.findFirst({
      where: { id: productId, tenant_id: tenantId, deleted_at: null },
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    await prisma.product.update({
      where: { id: productId },
      data: { deleted_at: new Date(), status: 'inactive' },
    });

    return res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};
