import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { hashPassword, requireAdmin, signToken, verifyPassword, verifyToken } from './auth.ts';
import type { AuthenticatedRequest } from './auth.ts';
import type { DataStore } from './storeTypes.ts';

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

export function createApiRouter(store: DataStore): express.Router {
  const router = express.Router();

  // --- PUBLIC API ---
  router.get('/menu', (_req, res) => {
    try {
      const settings = store.getSettings();
      const categories = store.getCategories(true);
      const products = store.getProducts(true);
      res.json({ settings, categories, products });
    } catch (err) {
      console.error('Error loading public menu:', err);
      res.status(500).json({ error: 'Erro ao carregar o cardápio.' });
    }
  });

  // --- AUTH API ---
  router.post('/auth/login', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Informe e-mail e senha.' });
      return;
    }

    const admin = store.getAdminByEmail(email);
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      return;
    }

    const token = signToken(admin.email);
    res.json({ token, email: admin.email });
  });

  router.get('/auth/me', (req, res) => {
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

  router.post('/admin/change-password', requireAdmin, (req: AuthenticatedRequest, res) => {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!currentPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' });
      return;
    }

    const admin = req.adminEmail ? store.getAdminByEmail(req.adminEmail) : undefined;
    if (!admin || !verifyPassword(currentPassword, admin.password_hash)) {
      res.status(400).json({ error: 'Senha atual incorreta.' });
      return;
    }

    const nextHash = hashPassword(newPassword);
    store.updateAdminPassword(admin.email, nextHash);
    res.json({ ok: true });
  });

  // --- PROTECTED ADMIN API ---
  router.get('/admin/overview', requireAdmin, (_req, res) => {
    try {
      const settings = store.getSettings();
      const categories = store.getCategories(false);
      const products = store.getProducts(false);
      const addons = store.getAddons(false);

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

  router.put('/admin/settings', requireAdmin, (req, res) => {
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
      ? body.payment_methods
          .filter((m: unknown): m is string => typeof m === 'string' && m.trim().length > 0)
          .map((m: string) => m.trim())
      : [];
    const storeStatusMode =
      body.store_status_mode === 'open' || body.store_status_mode === 'closed'
        ? body.store_status_mode
        : 'auto';
    const currentSettings = store.getSettings();
    const scheduleObj =
      body.schedule && typeof body.schedule === 'object' ? body.schedule : currentSettings.schedule;

    if (!storeName || !whatsappNumber || deliveryFee === null || paymentMethods.length === 0) {
      res.status(400).json({
        error: 'Preencha nome da loja, WhatsApp, taxa de entrega válida e ao menos uma forma de pagamento.',
      });
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

    const updated = store.updateSettings({
      id: 1,
      store_name: storeName,
      logo_url: logoUrl,
      banner_title: bannerTitle,
      banner_subtitle: bannerSubtitle,
      banner_image_url: bannerImageUrl,
      about_title: aboutTitle,
      about_description: aboutDescription,
      about_image_url: aboutImageUrl,
      whatsapp_number: whatsappNumber,
      address,
      opening_hours: openingHours,
      contact_info: contactInfo,
      delivery_fee: deliveryFee,
      payment_methods: paymentMethods,
      store_status_mode: storeStatusMode,
      schedule: scheduleObj,
    });

    res.json({ settings: updated });
  });

  router.post('/admin/upload', requireAdmin, (req, res) => {
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
    fs.mkdirSync(store.uploadsDir, { recursive: true });
    const resolved = path.resolve(store.uploadsDir, filename);

    if (!resolved.startsWith(store.uploadsDir + path.sep)) {
      res.status(400).json({ error: 'Caminho de arquivo inválido.' });
      return;
    }

    fs.writeFileSync(resolved, buffer);
    res.json({ url: `/uploads/${filename}` });
  });

  // --- CATEGORIES CRUD ---
  router.post('/admin/categories', requireAdmin, (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const active = req.body?.active !== false;

    if (!name) {
      res.status(400).json({ error: 'Informe o nome da categoria.' });
      return;
    }

    const categories = store.createCategory(name, description, active);
    res.status(201).json({ categories });
  });

  router.put('/admin/categories/reorder', requireAdmin, (req, res) => {
    const orderedIds = Array.isArray(req.body?.orderedIds)
      ? req.body.orderedIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
      : [];

    if (orderedIds.length === 0) {
      res.status(400).json({ error: 'Lista de ordenação inválida.' });
      return;
    }

    res.json({ categories: store.reorderCategories(orderedIds) });
  });

  router.put('/admin/categories/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const active = req.body?.active !== false;

    if (!Number.isInteger(id) || id <= 0 || !name) {
      res.status(400).json({ error: 'Dados de categoria inválidos.' });
      return;
    }

    const categories = store.updateCategory(id, name, description, active);
    if (!categories) {
      res.status(404).json({ error: 'Categoria não encontrada.' });
      return;
    }

    res.json({ categories });
  });

  router.delete('/admin/categories/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const result = store.deleteCategory(id);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ categories: result.categories });
  });

  // --- ADDONS CRUD ---
  router.post('/admin/addons', requireAdmin, (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const price = parsePositivePrice(req.body?.price);
    const active = req.body?.active !== false;

    if (!name || price === null) {
      res.status(400).json({ error: 'Informe nome e preço válido para o adicional.' });
      return;
    }

    const result = store.createAddon(name, price, active);
    res.status(201).json(result);
  });

  router.put('/admin/addons/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const price = parsePositivePrice(req.body?.price);
    const active = req.body?.active !== false;

    if (!Number.isInteger(id) || id <= 0 || !name || price === null) {
      res.status(400).json({ error: 'Dados de adicional inválidos.' });
      return;
    }

    res.json({ addons: store.updateAddon(id, name, price, active) });
  });

  router.delete('/admin/addons/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }
    res.json({ addons: store.deleteAddon(id) });
  });

  // --- PRODUCTS CRUD ---
  router.post('/admin/products', requireAdmin, (req, res) => {
    const categoryId = Number(req.body?.category_id);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const price = parsePositivePrice(req.body?.price);
    const imageUrl = typeof req.body?.image_url === 'string' ? req.body.image_url.trim() : '';
    const featured = Boolean(req.body?.featured);
    const active = req.body?.active !== false;
    const available = req.body?.available !== false;
    const isDemo = Boolean(req.body?.is_demo);
    const addonIds = Array.isArray(req.body?.addon_ids)
      ? req.body.addon_ids.map((v: unknown) => Number(v)).filter((v: number) => Number.isInteger(v) && v > 0)
      : [];

    if (!Number.isInteger(categoryId) || categoryId <= 0 || !name || price === null || !isValidUrlOrRelative(imageUrl)) {
      res.status(400).json({ error: 'Preencha categoria, nome, preço válido e URL de imagem válida.' });
      return;
    }

    const result = store.createProduct({
      category_id: categoryId,
      name,
      description,
      price,
      image_url: imageUrl,
      featured,
      active,
      available,
      is_demo: isDemo,
      addon_ids: addonIds,
    });
    res.status(201).json(result);
  });

  router.put('/admin/products/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const categoryId = Number(req.body?.category_id);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const price = parsePositivePrice(req.body?.price);
    const imageUrl = typeof req.body?.image_url === 'string' ? req.body.image_url.trim() : '';
    const featured = Boolean(req.body?.featured);
    const active = req.body?.active !== false;
    const available = req.body?.available !== false;
    const isDemo = Boolean(req.body?.is_demo);
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

    const products = store.updateProduct(id, {
      category_id: categoryId,
      name,
      description,
      price,
      image_url: imageUrl,
      featured,
      active,
      available,
      is_demo: isDemo,
      addon_ids: addonIds,
    });

    if (!products) {
      res.status(404).json({ error: 'Produto não encontrado.' });
      return;
    }

    res.json({ products });
  });

  router.delete('/admin/products/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }
    res.json({ products: store.deleteProduct(id) });
  });

  return router;
}
