import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  createRequireAdmin,
  hashPassword,
  hashSessionToken,
  signToken,
  TOKEN_TTL_MS,
  verifyAdminToken,
  verifyPassword,
} from './auth.ts';
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

interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

function getCloudinaryCredentials(): CloudinaryCredentials | null {
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();
  if (cloudName && apiKey && apiSecret) {
    return { cloudName, apiKey, apiSecret };
  }

  const rawUrl = (process.env.CLOUDINARY_URL || '').trim();
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'cloudinary:' && parsed.username && parsed.password && parsed.hostname) {
        return {
          cloudName: parsed.hostname,
          apiKey: decodeURIComponent(parsed.username),
          apiSecret: decodeURIComponent(parsed.password),
        };
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function uploadBufferToCloudinary(
  creds: CloudinaryCredentials,
  buffer: Buffer,
  mime: string,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'bulldog-cardapio';
  const signaturePayload = `folder=${folder}&timestamp=${timestamp}${creds.apiSecret}`;
  const signature = crypto.createHash('sha1').update(signaturePayload).digest('hex');

  const formData = new FormData();
  const bytes = new Uint8Array(buffer);
  formData.append('file', new Blob([bytes], { type: mime }), `upload.${mime.split('/')[1] || 'jpg'}`);
  formData.append('api_key', creds.apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('folder', folder);
  formData.append('signature', signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(creds.cloudName)}/image/upload`,
    {
      method: 'POST',
      body: formData,
    },
  );

  const data = (await response.json()) as { secure_url?: string; error?: { message?: string } };
  if (!response.ok || typeof data.secure_url !== 'string' || !data.secure_url.startsWith('https://')) {
    throw new Error(data.error?.message || 'Falha ao enviar imagem para o Cloudinary.');
  }
  return data.secure_url;
}

export function createApiRouter(store: DataStore): express.Router {
  const router = express.Router();
  const requireAdmin = createRequireAdmin(store);

  // --- PUBLIC API ---
  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  router.get('/menu', async (_req, res) => {
    try {
      const [settings, categories, products] = await Promise.all([
        store.getSettings(),
        store.getCategories(true),
        store.getProducts(true),
      ]);
      res.json({ settings, categories, products });
    } catch (err) {
      console.error('Error loading public menu:', err);
      res.status(500).json({ error: 'Erro ao carregar o cardápio.' });
    }
  });

  // --- AUTH API ---
  router.post('/auth/login', async (req, res) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!email || !password) {
        res.status(400).json({ error: 'Informe e-mail e senha.' });
        return;
      }

      const admin = await store.getAdminByEmail(email);
      if (!admin || !verifyPassword(password, admin.password_hash)) {
        res.status(401).json({ error: 'E-mail ou senha inválidos.' });
        return;
      }

      const token = signToken(admin.email);
      await store.saveSession(hashSessionToken(token), admin.email, Date.now() + TOKEN_TTL_MS);
      res.json({ token, email: admin.email });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Erro interno ao autenticar.' });
    }
  });

  router.post('/auth/logout', async (req, res) => {
    try {
      const header = req.headers.authorization;
      if (header && header.startsWith('Bearer ')) {
        const token = header.slice('Bearer '.length).trim();
        if (token) {
          await store.deleteSession(hashSessionToken(token));
        }
      }
      res.json({ ok: true });
    } catch {
      res.json({ ok: true });
    }
  });

  router.get('/auth/me', async (req, res) => {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }
      const email = await verifyAdminToken(header.slice('Bearer '.length).trim(), store);
      if (!email) {
        res.status(401).json({ error: 'Sessão expirada.' });
        return;
      }
      res.json({ email });
    } catch {
      res.status(500).json({ error: 'Erro ao verificar sessão.' });
    }
  });

  router.post('/admin/change-password', requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

      if (!currentPassword || newPassword.length < 8) {
        res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' });
        return;
      }

      const admin = req.adminEmail ? await store.getAdminByEmail(req.adminEmail) : undefined;
      if (!admin || !verifyPassword(currentPassword, admin.password_hash)) {
        res.status(400).json({ error: 'Senha atual incorreta.' });
        return;
      }

      const nextHash = hashPassword(newPassword);
      await store.updateAdminPassword(admin.email, nextHash);
      res.json({ ok: true });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({ error: 'Erro ao alterar senha.' });
    }
  });

  // --- PROTECTED ADMIN API ---
  router.get('/admin/overview', requireAdmin, async (_req, res) => {
    try {
      const [settings, categories, products, addons] = await Promise.all([
        store.getSettings(),
        store.getCategories(false),
        store.getProducts(false),
        store.getAddons(false),
      ]);

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

  router.put('/admin/settings', requireAdmin, async (req, res) => {
    try {
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
      const currentSettings = await store.getSettings();
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

      const updated = await store.updateSettings({
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
    } catch (err) {
      console.error('Update settings error:', err);
      res.status(500).json({ error: 'Erro ao salvar configurações.' });
    }
  });

  router.post('/admin/upload', requireAdmin, async (req, res) => {
    try {
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

      const cloudinaryCreds = getCloudinaryCredentials();
      if (cloudinaryCreds) {
        const secureUrl = await uploadBufferToCloudinary(cloudinaryCreds, buffer, mime);
        res.json({ url: secureUrl });
        return;
      }

      if (process.env.VERCEL === '1') {
        res.status(400).json({
          error:
            'Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET na Vercel para salvar fotos permanentemente.',
        });
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
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao enviar imagem.' });
    }
  });

  // --- CATEGORIES CRUD ---
  router.post('/admin/categories', requireAdmin, async (req, res) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
      const active = req.body?.active !== false;

      if (!name) {
        res.status(400).json({ error: 'Informe o nome da categoria.' });
        return;
      }

      const categories = await store.createCategory(name, description, active);
      res.status(201).json({ categories });
    } catch (err) {
      console.error('Create category error:', err);
      res.status(500).json({ error: 'Erro ao criar categoria.' });
    }
  });

  router.put('/admin/categories/reorder', requireAdmin, async (req, res) => {
    try {
      const orderedIds = Array.isArray(req.body?.orderedIds)
        ? req.body.orderedIds
            .map((id: unknown) => Number(id))
            .filter((id: number) => Number.isInteger(id) && id > 0)
        : [];

      if (orderedIds.length === 0) {
        res.status(400).json({ error: 'Lista de ordenação inválida.' });
        return;
      }

      res.json({ categories: await store.reorderCategories(orderedIds) });
    } catch (err) {
      console.error('Reorder categories error:', err);
      res.status(500).json({ error: 'Erro ao reordenar categorias.' });
    }
  });

  router.put('/admin/categories/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
      const active = req.body?.active !== false;

      if (!Number.isInteger(id) || id <= 0 || !name) {
        res.status(400).json({ error: 'Dados de categoria inválidos.' });
        return;
      }

      const categories = await store.updateCategory(id, name, description, active);
      if (!categories) {
        res.status(404).json({ error: 'Categoria não encontrada.' });
        return;
      }

      res.json({ categories });
    } catch (err) {
      console.error('Update category error:', err);
      res.status(500).json({ error: 'Erro ao atualizar categoria.' });
    }
  });

  router.delete('/admin/categories/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'ID inválido.' });
        return;
      }

      const result = await store.deleteCategory(id);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ categories: result.categories });
    } catch (err) {
      console.error('Delete category error:', err);
      res.status(500).json({ error: 'Erro ao remover categoria.' });
    }
  });

  // --- ADDONS CRUD ---
  router.post('/admin/addons', requireAdmin, async (req, res) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const price = parsePositivePrice(req.body?.price);
      const active = req.body?.active !== false;

      if (!name || price === null) {
        res.status(400).json({ error: 'Informe nome e preço válido para o adicional.' });
        return;
      }

      const result = await store.createAddon(name, price, active);
      res.status(201).json(result);
    } catch (err) {
      console.error('Create addon error:', err);
      res.status(500).json({ error: 'Erro ao criar adicional.' });
    }
  });

  router.put('/admin/addons/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const price = parsePositivePrice(req.body?.price);
      const active = req.body?.active !== false;

      if (!Number.isInteger(id) || id <= 0 || !name || price === null) {
        res.status(400).json({ error: 'Dados de adicional inválidos.' });
        return;
      }

      res.json({ addons: await store.updateAddon(id, name, price, active) });
    } catch (err) {
      console.error('Update addon error:', err);
      res.status(500).json({ error: 'Erro ao atualizar adicional.' });
    }
  });

  router.delete('/admin/addons/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'ID inválido.' });
        return;
      }
      res.json({ addons: await store.deleteAddon(id) });
    } catch (err) {
      console.error('Delete addon error:', err);
      res.status(500).json({ error: 'Erro ao remover adicional.' });
    }
  });

  // --- PRODUCTS CRUD ---
  router.post('/admin/products', requireAdmin, async (req, res) => {
    try {
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
        ? req.body.addon_ids
            .map((v: unknown) => Number(v))
            .filter((v: number) => Number.isInteger(v) && v > 0)
        : [];

      if (
        !Number.isInteger(categoryId) ||
        categoryId <= 0 ||
        !name ||
        price === null ||
        !isValidUrlOrRelative(imageUrl)
      ) {
        res.status(400).json({ error: 'Preencha categoria, nome, preço válido e URL de imagem válida.' });
        return;
      }

      const result = await store.createProduct({
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
    } catch (err) {
      console.error('Create product error:', err);
      res.status(500).json({ error: 'Erro ao cadastrar produto.' });
    }
  });

  router.put('/admin/products/:id', requireAdmin, async (req, res) => {
    try {
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
        ? req.body.addon_ids
            .map((v: unknown) => Number(v))
            .filter((v: number) => Number.isInteger(v) && v > 0)
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

      const products = await store.updateProduct(id, {
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
    } catch (err) {
      console.error('Update product error:', err);
      res.status(500).json({ error: 'Erro ao atualizar produto.' });
    }
  });

  router.delete('/admin/products/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'ID inválido.' });
        return;
      }
      res.json({ products: await store.deleteProduct(id) });
    } catch (err) {
      console.error('Delete product error:', err);
      res.status(500).json({ error: 'Erro ao remover produto.' });
    }
  });

  return router;
}
