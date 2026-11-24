import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { hashPassword, requireAdmin, signToken, verifyPassword, verifyToken } from './server/auth.ts';
import type { AuthenticatedRequest } from './server/auth.ts';
import { db, getAddons, getCategories, getProducts, getSettings, initDatabase, UPLOADS_DIR } from './server/db.ts';

initDatabase();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set('trust proxy', true);
app.use(express.json({ limit: '8mb' }));

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `categoria-${Date.now()}`;
}

function isValidUrlOrRelative(value: string): boolean {
  if (!value) return true;
  if (value.startsWith('/')) return !value.startsWith('//');
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function parsePositivePrice(val: unknown): number | null {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
}

// Serve uploaded images and public assets cleanly in both dev and prod
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/assets', express.static(path.resolve(process.cwd(), 'public/assets')));

// --- PUBLIC API ---
app.get('/api/menu', (_req, res) => {
  try {
    const settings = getSettings();
    const categories = getCategories(true);
    const products = getProducts(true);
    res.json({ settings, categories, products });
  } catch (err) {
    console.error('Error loading public menu:', err);
    res.status(500).json({ error: 'Erro ao carregar o cardápio.' });
  }
});

// --- AUTH API ---
app.post('/api/auth/login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Informe e-mail e senha.' });
    return;
  }

  const admin = db.prepare('SELECT id, email, password_hash FROM admins WHERE email = ?').get(email) as
    | { id: number; email: string; password_hash: string }
    | undefined;

  if (!admin || !verifyPassword(password, admin.password_hash)) {
    res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    return;
  }

  const token = signToken(admin.email);
  res.json({ token, email: admin.email });
});

app.get('/api/auth/me', (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Não autenticado.' });
    return;
  }
  const payload = verifyToken(header.slice('Bearer '.length).trim());
  if (!payload) {
    res.status(401).json({ error: 'Sessão expirada.' });
    return;
  }
  res.json({ email: payload.email });
});

app.post('/api/admin/change-password', requireAdmin, (req: AuthenticatedRequest, res) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!currentPassword || newPassword.length < 8) {
    res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' });
    return;
  }

  const admin = db
    .prepare('SELECT id, email, password_hash FROM admins WHERE email = ?')
    .get(req.adminEmail) as { id: number; email: string; password_hash: string } | undefined;

  if (!admin || !verifyPassword(currentPassword, admin.password_hash)) {
    res.status(400).json({ error: 'Senha atual incorreta.' });
    return;
  }

  const nextHash = hashPassword(newPassword);
  db.prepare('UPDATE admins SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    nextHash,
    admin.id,
  );
  res.json({ ok: true });
});

// --- PROTECTED ADMIN API ---
app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  try {
    const settings = getSettings();
    const categories = getCategories(false);
    const products = getProducts(false);
    const addons = getAddons(false);

    const stats = {
      totalProducts: products.length,
      totalCategories: categories.length,
      activeProducts: products.filter((p) => p.active && p.available).length,
      unavailableProducts: products.filter((p) => !p.active || !p.available).length,
    };

    res.json({ settings, categories, products, addons, stats });
  } catch (err) {
    console.error('Error loading admin overview:', err);
    res.status(500).json({ error: 'Erro ao carregar dados do painel.' });
  }
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const body = req.body ?? {};
  const storeName = typeof body.store_name === 'string' ? body.store_name.trim() : '';
  const logoUrl = typeof body.logo_url === 'string' ? body.logo_url.trim() : '';
  const bannerTitle = typeof body.banner_title === 'string' ? body.banner_title.trim() : '';
  const bannerSubtitle = typeof body.banner_subtitle === 'string' ? body.banner_subtitle.trim() : '';
  const bannerImageUrl = typeof body.banner_image_url === 'string' ? body.banner_image_url.trim() : '';
  const aboutTitle = typeof body.about_title === 'string' ? body.about_title.trim() : '';
  const aboutDescription = typeof body.about_description === 'string' ? body.about_description.trim() : '';
  const aboutImageUrl = typeof body.about_image_url === 'string' ? body.about_image_url.trim() : '';
  const whatsappNumber = typeof body.whatsapp_number === 'string' ? body.whatsapp_number.replace(/\D/g, '') : '';
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const openingHours = typeof body.opening_hours === 'string' ? body.opening_hours.trim() : '';
  const contactInfo = typeof body.contact_info === 'string' ? body.contact_info.trim() : '';
  const deliveryFee = parsePositivePrice(body.delivery_fee ?? 0);
  const paymentMethods = Array.isArray(body.payment_methods)
    ? body.payment_methods.filter((m: unknown): m is string => typeof m === 'string' && m.trim().length > 0).map((m: string) => m.trim())
    : [];
  const storeStatusMode =
    body.store_status_mode === 'open' || body.store_status_mode === 'closed' ? body.store_status_mode : 'auto';
  const scheduleObj = body.schedule && typeof body.schedule === 'object' ? body.schedule : {};

  if (!storeName || !whatsappNumber || deliveryFee === null || paymentMethods.length === 0) {
    res.status(400).json({ error: 'Preencha nome da loja, WhatsApp, taxa de entrega válida e ao menos uma forma de pagamento.' });
    return;
  }

  if (
    !isValidUrlOrRelative(logoUrl) ||
    !isValidUrlOrRelative(bannerImageUrl) ||
    !isValidUrlOrRelative(aboutImageUrl)
  ) {
    res.status(400).json({ error: 'URL de imagem inválida.' });
    return;
  }

  db.prepare(
    `UPDATE settings SET
      store_name = ?,
      logo_url = ?,
      banner_title = ?,
      banner_subtitle = ?,
      banner_image_url = ?,
      about_title = ?,
      about_description = ?,
      about_image_url = ?,
      whatsapp_number = ?,
      address = ?,
      opening_hours = ?,
      contact_info = ?,
      delivery_fee = ?,
      payment_methods_json = ?,
      store_status_mode = ?,
      schedule_json = ?
     WHERE id = 1`,
  ).run(
    storeName,
    logoUrl,
    bannerTitle,
    bannerSubtitle,
    bannerImageUrl,
    aboutTitle,
    aboutDescription,
    aboutImageUrl,
    whatsappNumber,
    address,
    openingHours,
    contactInfo,
    deliveryFee,
    JSON.stringify(paymentMethods),
    storeStatusMode,
    JSON.stringify(scheduleObj),
  );

  res.json({ settings: getSettings() });
});

app.post('/api/admin/upload', requireAdmin, (req, res) => {
  const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
  const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) {
    res.status(400).json({ error: 'Formato de imagem inválido. Use PNG, JPG, WEBP ou GIF.' });
    return;
  }

  const mime = match[1];
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, 'base64');

  if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
    res.status(400).json({ error: 'A imagem deve ter no máximo 5 MB.' });
    return;
  }

  const ext = mime === 'image/jpeg' || mime === 'image/jpg' ? 'jpg' : mime.split('/')[1];
  const filename = `${crypto.randomUUID()}.${ext}`;
  const resolved = path.resolve(UPLOADS_DIR, filename);

  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) {
    res.status(400).json({ error: 'Caminho de arquivo inválido.' });
    return;
  }

  fs.writeFileSync(resolved, buffer);
  res.json({ url: `/uploads/${filename}` });
});

// --- CATEGORIES CRUD ---
app.post('/api/admin/categories', requireAdmin, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const active = req.body?.active !== false ? 1 : 0;

  if (!name) {
    res.status(400).json({ error: 'Informe o nome da categoria.' });
    return;
  }

  const maxOrderRow = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM categories').get() as {
    max_order: number;
  };
  let slug = slugify(name);
  const dup = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
  if (dup) {
    slug = `${slug}-${Date.now().toString().slice(-4)}`;
  }

  const info = db
    .prepare('INSERT INTO categories (name, slug, description, sort_order, active) VALUES (?, ?, ?, ?, ?)')
    .run(name, slug, description, maxOrderRow.max_order + 1, active);

  res.status(201).json({ id: Number(info.lastInsertRowid), categories: getCategories(false) });
});

app.put('/api/admin/categories/reorder', requireAdmin, (req, res) => {
  const orderedIds = Array.isArray(req.body?.orderedIds)
    ? req.body.orderedIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
    : [];

  if (orderedIds.length === 0) {
    res.status(400).json({ error: 'Lista de ordenação inválida.' });
    return;
  }

  const updateStmt = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((ids: number[]) => {
    ids.forEach((id, idx) => {
      updateStmt.run(idx + 1, id);
    });
  });
  tx(orderedIds);
  res.json({ categories: getCategories(false) });
});

app.put('/api/admin/categories/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const active = req.body?.active !== false ? 1 : 0;

  if (!Number.isInteger(id) || id <= 0 || !name) {
    res.status(400).json({ error: 'Dados de categoria inválidos.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Categoria não encontrada.' });
    return;
  }

  db.prepare('UPDATE categories SET name = ?, description = ?, active = ? WHERE id = ?').run(
    name,
    description,
    active,
    id,
  );
  res.json({ categories: getCategories(false) });
});

app.delete('/api/admin/categories/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }

  const productCount = (
    db.prepare('SELECT COUNT(*) AS count FROM products WHERE category_id = ?').get(id) as { count: number }
  ).count;

  if (productCount > 0) {
    res.status(400).json({
      error: `Esta categoria possui ${productCount} produto(s). Mova ou exclua os produtos antes de remover a categoria.`,
    });
    return;
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ categories: getCategories(false) });
});

// --- ADDONS CRUD ---
app.post('/api/admin/addons', requireAdmin, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const price = parsePositivePrice(req.body?.price);
  const active = req.body?.active !== false ? 1 : 0;

  if (!name || price === null) {
    res.status(400).json({ error: 'Informe nome e preço válido para o adicional.' });
    return;
  }

  const info = db.prepare('INSERT INTO addons (name, price, active) VALUES (?, ?, ?)').run(name, price, active);
  res.status(201).json({ id: Number(info.lastInsertRowid), addons: getAddons(false) });
});

app.put('/api/admin/addons/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const price = parsePositivePrice(req.body?.price);
  const active = req.body?.active !== false ? 1 : 0;

  if (!Number.isInteger(id) || id <= 0 || !name || price === null) {
    res.status(400).json({ error: 'Dados de adicional inválidos.' });
    return;
  }

  db.prepare('UPDATE addons SET name = ?, price = ?, active = ? WHERE id = ?').run(name, price, active, id);
  res.json({ addons: getAddons(false) });
});

app.delete('/api/admin/addons/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  db.prepare('DELETE FROM addons WHERE id = ?').run(id);
  res.json({ addons: getAddons(false) });
});

// --- PRODUCTS CRUD ---
app.post('/api/admin/products', requireAdmin, (req, res) => {
  const categoryId = Number(req.body?.category_id);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const price = parsePositivePrice(req.body?.price);
  const imageUrl = typeof req.body?.image_url === 'string' ? req.body.image_url.trim() : '';
  const featured = req.body?.featured ? 1 : 0;
  const active = req.body?.active !== false ? 1 : 0;
  const available = req.body?.available !== false ? 1 : 0;
  const isDemo = req.body?.is_demo ? 1 : 0;
  const addonIds = Array.isArray(req.body?.addon_ids)
    ? req.body.addon_ids.map((v: unknown) => Number(v)).filter((v: number) => Number.isInteger(v) && v > 0)
    : [];

  if (!Number.isInteger(categoryId) || categoryId <= 0 || !name || price === null || !isValidUrlOrRelative(imageUrl)) {
    res.status(400).json({ error: 'Preencha categoria, nome, preço válido e URL de imagem válida.' });
    return;
  }

  const maxSort = (
    db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM products WHERE category_id = ?')
      .get(categoryId) as { max_order: number }
  ).max_order;

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO products (
          category_id, name, description, price, image_url, featured, active, available, is_demo, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(categoryId, name, description, price, imageUrl, featured, active, available, isDemo, maxSort + 1);

    const productId = Number(info.lastInsertRowid);
    const linkStmt = db.prepare('INSERT OR IGNORE INTO product_addons (product_id, addon_id) VALUES (?, ?)');
    for (const addonId of addonIds) {
      linkStmt.run(productId, addonId);
    }
    return productId;
  });

  const productId = tx();
  res.status(201).json({ id: productId, products: getProducts(false) });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const categoryId = Number(req.body?.category_id);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const price = parsePositivePrice(req.body?.price);
  const imageUrl = typeof req.body?.image_url === 'string' ? req.body.image_url.trim() : '';
  const featured = req.body?.featured ? 1 : 0;
  const active = req.body?.active !== false ? 1 : 0;
  const available = req.body?.available !== false ? 1 : 0;
  const isDemo = req.body?.is_demo ? 1 : 0;
  const addonIds = Array.isArray(req.body?.addon_ids)
    ? req.body.addon_ids.map((v: unknown) => Number(v)).filter((v: number) => Number.isInteger(v) && v > 0)
    : [];

  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !Number.isInteger(categoryId) ||
    categoryId <= 0 ||
    !name ||
    price === null ||
    !isValidUrlOrRelative(imageUrl)
  ) {
    res.status(400).json({ error: 'Dados do produto inválidos.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Produto não encontrado.' });
    return;
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE products SET
        category_id = ?,
        name = ?,
        description = ?,
        price = ?,
        image_url = ?,
        featured = ?,
        active = ?,
        available = ?,
        is_demo = ?
      WHERE id = ?`,
    ).run(categoryId, name, description, price, imageUrl, featured, active, available, isDemo, id);

    db.prepare('DELETE FROM product_addons WHERE product_id = ?').run(id);
    const linkStmt = db.prepare('INSERT OR IGNORE INTO product_addons (product_id, addon_id) VALUES (?, ?)');
    for (const addonId of addonIds) {
      linkStmt.run(id, addonId);
    }
  });

  tx();
  res.json({ products: getProducts(false) });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  res.json({ products: getProducts(false) });
});

async function startServer(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*splat', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bulldog Hamburgueria server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
