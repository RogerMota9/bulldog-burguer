import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { hashPassword } from './auth.ts';
import type { AdminRecord, AdminSessionRecord, DataStore, ProductInput } from './storeTypes.ts';
import {
  DEFAULT_ADDONS_CATALOG,
  DEFAULT_PUBLIC_MENU,
  DEFAULT_WEEKLY_SCHEDULE,
} from '../src/data/defaultCatalog.ts';
import type {
  Addon,
  Category,
  Product,
  StoreSettings,
  StoreStatusMode,
  WeeklySchedule,
} from '../src/types.ts';

const DEFAULT_ADMIN_EMAIL = (process.env.ADMIN_INITIAL_EMAIL || 'albartholiveira@gmail.com')
  .trim()
  .toLowerCase();
const DEFAULT_INITIAL_HASH =
  process.env.ADMIN_INITIAL_PASSWORD && process.env.ADMIN_INITIAL_PASSWORD.trim().length > 0
    ? hashPassword(process.env.ADMIN_INITIAL_PASSWORD.trim())
    : 'scrypt$70e739a099eab82f92508f7abe428191$479b99b6c35c99cdde2732aa3c76ee9d53880838680f88859224453a6f7cc0ae0845d7e8ca189835c6c6d57c646dc0eae4844fab6cb3d21d72f0e4976fbf3903';

let poolInstance: Pool | null = null;
let initPromise: Promise<void> | null = null;

function getPool(): Pool {
  if (poolInstance) return poolInstance;
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured.');
  }
  const isLocal =
    connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  poolInstance = new Pool({
    connectionString,
    max: 5,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  return poolInstance;
}

function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `categoria-${Date.now()}`
  );
}

function parsePaymentMethods(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
      }
    } catch {
      // fall through
    }
  }
  return ['Dinheiro', 'Pix', 'Cartão de crédito', 'Cartão de débito'];
}

function parseSchedule(raw: unknown): WeeklySchedule {
  let parsedObj: Partial<WeeklySchedule> | null = null;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      parsedObj = JSON.parse(raw) as Partial<WeeklySchedule>;
    } catch {
      parsedObj = null;
    }
  } else if (raw && typeof raw === 'object') {
    parsedObj = raw as Partial<WeeklySchedule>;
  }
  if (parsedObj) {
    return {
      dom: parsedObj.dom ?? DEFAULT_WEEKLY_SCHEDULE.dom,
      seg: parsedObj.seg ?? DEFAULT_WEEKLY_SCHEDULE.seg,
      ter: parsedObj.ter ?? DEFAULT_WEEKLY_SCHEDULE.ter,
      qua: parsedObj.qua ?? DEFAULT_WEEKLY_SCHEDULE.qua,
      qui: parsedObj.qui ?? DEFAULT_WEEKLY_SCHEDULE.qui,
      sex: parsedObj.sex ?? DEFAULT_WEEKLY_SCHEDULE.sex,
      sab: parsedObj.sab ?? DEFAULT_WEEKLY_SCHEDULE.sab,
    };
  }
  return structuredClone(DEFAULT_WEEKLY_SCHEDULE);
}

async function seedCatalogInTx(client: PoolClient): Promise<void> {
  for (const cat of DEFAULT_PUBLIC_MENU.categories) {
    await client.query(
      `INSERT INTO categories (id, name, slug, description, sort_order, active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [cat.id, cat.name, cat.slug, cat.description, cat.sort_order, cat.active],
    );
  }

  for (const addon of DEFAULT_ADDONS_CATALOG) {
    await client.query(
      `INSERT INTO addons (id, name, price, active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [addon.id, addon.name, addon.price, addon.active],
    );
  }

  for (const prod of DEFAULT_PUBLIC_MENU.products) {
    await client.query(
      `INSERT INTO products (
        id, category_id, name, description, price, image_url,
        featured, active, available, is_demo, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING`,
      [
        prod.id,
        prod.category_id,
        prod.name,
        prod.description,
        prod.price,
        prod.image_url,
        prod.featured,
        prod.active,
        prod.available,
        prod.is_demo,
        prod.sort_order,
      ],
    );
    for (const addon of prod.addons) {
      await client.query(
        `INSERT INTO product_addons (product_id, addon_id)
         VALUES ($1, $2)
         ON CONFLICT (product_id, addon_id) DO NOTHING`,
        [prod.id, addon.id],
      );
    }
  }

  await client.query(
    `SELECT setval(pg_get_serial_sequence('categories', 'id'), COALESCE((SELECT MAX(id) FROM categories), 1), true)`,
  );
  await client.query(
    `SELECT setval(pg_get_serial_sequence('addons', 'id'), COALESCE((SELECT MAX(id) FROM addons), 1), true)`,
  );
  await client.query(
    `SELECT setval(pg_get_serial_sequence('products', 'id'), COALESCE((SELECT MAX(id) FROM products), 1), true)`,
  );
}

async function ensureInitialized(): Promise<Pool> {
  const pool = getPool();
  if (!initPromise) {
    initPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS admins (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS admin_sessions (
            token_hash TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            expires_at BIGINT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            store_name TEXT NOT NULL,
            logo_url TEXT NOT NULL DEFAULT '',
            banner_title TEXT NOT NULL,
            banner_subtitle TEXT NOT NULL,
            banner_image_url TEXT NOT NULL,
            about_title TEXT NOT NULL,
            about_description TEXT NOT NULL,
            about_image_url TEXT NOT NULL,
            whatsapp_number TEXT NOT NULL,
            address TEXT NOT NULL,
            opening_hours TEXT NOT NULL,
            contact_info TEXT NOT NULL,
            delivery_fee DOUBLE PRECISION NOT NULL DEFAULT 0,
            payment_methods_json TEXT NOT NULL,
            store_status_mode TEXT NOT NULL DEFAULT 'auto',
            schedule_json TEXT NOT NULL DEFAULT ''
          );

          CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            active BOOLEAN NOT NULL DEFAULT TRUE
          );

          CREATE TABLE IF NOT EXISTS addons (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            price DOUBLE PRECISION NOT NULL DEFAULT 0,
            active BOOLEAN NOT NULL DEFAULT TRUE
          );

          CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            price DOUBLE PRECISION NOT NULL DEFAULT 0,
            image_url TEXT NOT NULL DEFAULT '',
            featured BOOLEAN NOT NULL DEFAULT FALSE,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            available BOOLEAN NOT NULL DEFAULT TRUE,
            is_demo BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS product_addons (
            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            addon_id INTEGER NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
            PRIMARY KEY (product_id, addon_id)
          );
        `);

        const adminRes = await client.query('SELECT id FROM admins LIMIT 1');
        if (adminRes.rowCount === 0) {
          await client.query(
            'INSERT INTO admins (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
            [DEFAULT_ADMIN_EMAIL, DEFAULT_INITIAL_HASH],
          );
        }

        const settingsRes = await client.query('SELECT id FROM settings WHERE id = 1');
        if (settingsRes.rowCount === 0) {
          const s = DEFAULT_PUBLIC_MENU.settings;
          await client.query(
            `INSERT INTO settings (
              id, store_name, logo_url, banner_title, banner_subtitle, banner_image_url,
              about_title, about_description, about_image_url, whatsapp_number, address,
              opening_hours, contact_info, delivery_fee, payment_methods_json,
              store_status_mode, schedule_json
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
            ON CONFLICT (id) DO NOTHING`,
            [
              1,
              s.store_name,
              s.logo_url,
              s.banner_title,
              s.banner_subtitle,
              s.banner_image_url,
              s.about_title,
              s.about_description,
              s.about_image_url,
              s.whatsapp_number,
              s.address,
              s.opening_hours,
              s.contact_info,
              s.delivery_fee,
              JSON.stringify(s.payment_methods),
              s.store_status_mode,
              JSON.stringify(s.schedule),
            ],
          );
        }

        const catCountRes = await client.query('SELECT COUNT(*)::int AS cnt FROM categories');
        if ((catCountRes.rows[0]?.cnt ?? 0) === 0) {
          await client.query('BEGIN');
          try {
            await seedCatalogInTx(client);
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          }
        }
      } finally {
        client.release();
      }
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
  return pool;
}

async function fetchCategories(pool: Pool, onlyActive = false): Promise<Category[]> {
  const sql = onlyActive
    ? 'SELECT id, name, slug, description, sort_order, active FROM categories WHERE active = TRUE ORDER BY sort_order ASC, id ASC'
    : 'SELECT id, name, slug, description, sort_order, active FROM categories ORDER BY sort_order ASC, id ASC';
  const res = await pool.query(sql);
  return res.rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    slug: String(r.slug),
    description: String(r.description ?? ''),
    sort_order: Number(r.sort_order ?? 0),
    active: Boolean(r.active),
  }));
}

async function fetchAddons(pool: Pool, onlyActive = false): Promise<Addon[]> {
  const sql = onlyActive
    ? 'SELECT id, name, price, active FROM addons WHERE active = TRUE ORDER BY id ASC'
    : 'SELECT id, name, price, active FROM addons ORDER BY id ASC';
  const res = await pool.query(sql);
  return res.rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    price: Number(r.price),
    active: Boolean(r.active),
  }));
}

async function fetchProducts(pool: Pool, onlyActive = false): Promise<Product[]> {
  const sql = onlyActive
    ? `SELECT p.id, p.category_id, c.name AS category_name, p.name, p.description, p.price,
              p.image_url, p.featured, p.active, p.available, p.is_demo, p.sort_order
       FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.active = TRUE AND c.active = TRUE
       ORDER BY c.sort_order ASC, p.sort_order ASC, p.id ASC`
    : `SELECT p.id, p.category_id, c.name AS category_name, p.name, p.description, p.price,
              p.image_url, p.featured, p.active, p.available, p.is_demo, p.sort_order
       FROM products p
       JOIN categories c ON c.id = p.category_id
       ORDER BY c.sort_order ASC, p.sort_order ASC, p.id ASC`;

  const [prodRes, addonLinksRes] = await Promise.all([
    pool.query(sql),
    pool.query(
      onlyActive
        ? `SELECT pa.product_id, a.id, a.name, a.price, a.active
           FROM product_addons pa
           JOIN addons a ON a.id = pa.addon_id
           WHERE a.active = TRUE
           ORDER BY a.id ASC`
        : `SELECT pa.product_id, a.id, a.name, a.price, a.active
           FROM product_addons pa
           JOIN addons a ON a.id = pa.addon_id
           ORDER BY a.id ASC`,
    ),
  ]);

  const addonsByProduct = new Map<number, Addon[]>();
  for (const ar of addonLinksRes.rows) {
    const pid = Number(ar.product_id);
    const list = addonsByProduct.get(pid) || [];
    list.push({
      id: Number(ar.id),
      name: String(ar.name),
      price: Number(ar.price),
      active: Boolean(ar.active),
    });
    addonsByProduct.set(pid, list);
  }

  return prodRes.rows.map((r) => ({
    id: Number(r.id),
    category_id: Number(r.category_id),
    category_name: String(r.category_name),
    name: String(r.name),
    description: String(r.description ?? ''),
    price: Number(r.price),
    image_url: String(r.image_url ?? ''),
    featured: Boolean(r.featured),
    active: Boolean(r.active),
    available: Boolean(r.available),
    is_demo: Boolean(r.is_demo),
    sort_order: Number(r.sort_order ?? 0),
    addons: addonsByProduct.get(Number(r.id)) || [],
  }));
}

export const pgStore: DataStore = {
  uploadsDir: '/tmp/bulldog/uploads',

  async getAdminByEmail(email: string): Promise<AdminRecord | undefined> {
    const pool = await ensureInitialized();
    const res = await pool.query(
      'SELECT id, email, password_hash FROM admins WHERE email = $1',
      [email],
    );
    const row = res.rows[0];
    if (!row) return undefined;
    return {
      id: Number(row.id),
      email: String(row.email),
      password_hash: String(row.password_hash),
    };
  },

  async updateAdminPassword(email: string, newHash: string): Promise<void> {
    const pool = await ensureInitialized();
    await pool.query(
      'UPDATE admins SET password_hash = $1, updated_at = NOW() WHERE email = $2',
      [newHash, email],
    );
  },

  async saveSession(tokenHash: string, email: string, expiresAt: number): Promise<void> {
    const pool = await ensureInitialized();
    await pool.query('DELETE FROM admin_sessions WHERE expires_at <= $1', [Date.now()]);
    await pool.query(
      `INSERT INTO admin_sessions (token_hash, email, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (token_hash) DO UPDATE SET email = EXCLUDED.email, expires_at = EXCLUDED.expires_at`,
      [tokenHash, email, expiresAt],
    );
  },

  async getSessionByTokenHash(tokenHash: string): Promise<AdminSessionRecord | undefined> {
    const pool = await ensureInitialized();
    const res = await pool.query(
      'SELECT token_hash, email, expires_at FROM admin_sessions WHERE token_hash = $1',
      [tokenHash],
    );
    const row = res.rows[0];
    if (!row) return undefined;
    const expiresAt = Number(row.expires_at);
    if (expiresAt <= Date.now()) {
      await pool.query('DELETE FROM admin_sessions WHERE token_hash = $1', [tokenHash]);
      return undefined;
    }
    return {
      token_hash: String(row.token_hash),
      email: String(row.email),
      expires_at: expiresAt,
    };
  },

  async deleteSession(tokenHash: string): Promise<void> {
    const pool = await ensureInitialized();
    await pool.query('DELETE FROM admin_sessions WHERE token_hash = $1', [tokenHash]);
  },

  async deleteSessionsByEmail(email: string): Promise<void> {
    const pool = await ensureInitialized();
    await pool.query('DELETE FROM admin_sessions WHERE email = $1', [email]);
  },

  async getSettings(): Promise<StoreSettings> {
    const pool = await ensureInitialized();
    const res = await pool.query('SELECT * FROM settings WHERE id = 1');
    const row = res.rows[0];
    if (!row) return structuredClone(DEFAULT_PUBLIC_MENU.settings);
    const mode =
      row.store_status_mode === 'open' || row.store_status_mode === 'closed'
        ? (row.store_status_mode as StoreStatusMode)
        : 'auto';
    return {
      id: Number(row.id),
      store_name: String(row.store_name),
      logo_url: String(row.logo_url ?? ''),
      banner_title: String(row.banner_title ?? ''),
      banner_subtitle: String(row.banner_subtitle ?? ''),
      banner_image_url: String(row.banner_image_url ?? ''),
      about_title: String(row.about_title ?? ''),
      about_description: String(row.about_description ?? ''),
      about_image_url: String(row.about_image_url ?? ''),
      whatsapp_number: String(row.whatsapp_number ?? ''),
      address: String(row.address ?? ''),
      opening_hours: String(row.opening_hours ?? ''),
      contact_info: String(row.contact_info ?? ''),
      delivery_fee: Number(row.delivery_fee ?? 0),
      payment_methods: parsePaymentMethods(row.payment_methods_json),
      store_status_mode: mode,
      schedule: parseSchedule(row.schedule_json),
    };
  },

  async updateSettings(next: StoreSettings): Promise<StoreSettings> {
    const pool = await ensureInitialized();
    await pool.query(
      `UPDATE settings SET
        store_name = $1,
        logo_url = $2,
        banner_title = $3,
        banner_subtitle = $4,
        banner_image_url = $5,
        about_title = $6,
        about_description = $7,
        about_image_url = $8,
        whatsapp_number = $9,
        address = $10,
        opening_hours = $11,
        contact_info = $12,
        delivery_fee = $13,
        payment_methods_json = $14,
        store_status_mode = $15,
        schedule_json = $16
      WHERE id = 1`,
      [
        next.store_name,
        next.logo_url,
        next.banner_title,
        next.banner_subtitle,
        next.banner_image_url,
        next.about_title,
        next.about_description,
        next.about_image_url,
        next.whatsapp_number,
        next.address,
        next.opening_hours,
        next.contact_info,
        next.delivery_fee,
        JSON.stringify(next.payment_methods),
        next.store_status_mode,
        JSON.stringify(next.schedule),
      ],
    );
    return this.getSettings();
  },

  async getCategories(onlyActive = false): Promise<Category[]> {
    const pool = await ensureInitialized();
    return fetchCategories(pool, onlyActive);
  },

  async createCategory(name: string, description: string, active: boolean): Promise<Category[]> {
    const pool = await ensureInitialized();
    const maxRes = await pool.query('SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM categories');
    const nextSort = Number(maxRes.rows[0]?.m ?? 0) + 1;
    let slug = slugify(name);
    const existsRes = await pool.query('SELECT id FROM categories WHERE slug = $1', [slug]);
    if ((existsRes.rowCount ?? 0) > 0) {
      slug = `${slug}-${Date.now()}`;
    }
    await pool.query(
      'INSERT INTO categories (name, slug, description, sort_order, active) VALUES ($1, $2, $3, $4, $5)',
      [name, slug, description, nextSort, active],
    );
    return fetchCategories(pool, false);
  },

  async updateCategory(
    id: number,
    name: string,
    description: string,
    active: boolean,
  ): Promise<Category[] | null> {
    const pool = await ensureInitialized();
    const res = await pool.query(
      'UPDATE categories SET name = $1, description = $2, active = $3 WHERE id = $4',
      [name, description, active, id],
    );
    if ((res.rowCount ?? 0) === 0) return null;
    return fetchCategories(pool, false);
  },

  async reorderCategories(orderedIds: number[]): Promise<Category[]> {
    const pool = await ensureInitialized();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let idx = 0; idx < orderedIds.length; idx++) {
        await client.query('UPDATE categories SET sort_order = $1 WHERE id = $2', [
          idx + 1,
          orderedIds[idx],
        ]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return fetchCategories(pool, false);
  },

  async deleteCategory(
    id: number,
  ): Promise<{ ok: true; categories: Category[] } | { ok: false; error: string }> {
    const pool = await ensureInitialized();
    const countRes = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM products WHERE category_id = $1',
      [id],
    );
    if (Number(countRes.rows[0]?.cnt ?? 0) > 0) {
      return {
        ok: false,
        error: 'Mova ou exclua os produtos desta categoria antes de removê-la.',
      };
    }
    await pool.query('DELETE FROM categories WHERE id = $1', [id]);
    return { ok: true, categories: await fetchCategories(pool, false) };
  },

  async getAddons(onlyActive = false): Promise<Addon[]> {
    const pool = await ensureInitialized();
    return fetchAddons(pool, onlyActive);
  },

  async createAddon(
    name: string,
    price: number,
    active: boolean,
  ): Promise<{ id: number; addons: Addon[] }> {
    const pool = await ensureInitialized();
    const res = await pool.query(
      'INSERT INTO addons (name, price, active) VALUES ($1, $2, $3) RETURNING id',
      [name, price, active],
    );
    return { id: Number(res.rows[0].id), addons: await fetchAddons(pool, false) };
  },

  async updateAddon(id: number, name: string, price: number, active: boolean): Promise<Addon[]> {
    const pool = await ensureInitialized();
    await pool.query('UPDATE addons SET name = $1, price = $2, active = $3 WHERE id = $4', [
      name,
      price,
      active,
      id,
    ]);
    return fetchAddons(pool, false);
  },

  async deleteAddon(id: number): Promise<Addon[]> {
    const pool = await ensureInitialized();
    await pool.query('DELETE FROM addons WHERE id = $1', [id]);
    return fetchAddons(pool, false);
  },

  async getProducts(onlyActive = false): Promise<Product[]> {
    const pool = await ensureInitialized();
    return fetchProducts(pool, onlyActive);
  },

  async createProduct(input: ProductInput): Promise<{ id: number; products: Product[] }> {
    const pool = await ensureInitialized();
    const client = await pool.connect();
    let productId = 0;
    try {
      await client.query('BEGIN');
      const maxRes = await client.query(
        'SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM products WHERE category_id = $1',
        [input.category_id],
      );
      const nextSort = Number(maxRes.rows[0]?.m ?? 0) + 1;
      const insertRes = await client.query(
        `INSERT INTO products (
          category_id, name, description, price, image_url,
          featured, active, available, is_demo, sort_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          input.category_id,
          input.name,
          input.description,
          input.price,
          input.image_url,
          input.featured,
          input.active,
          input.available,
          input.is_demo,
          nextSort,
        ],
      );
      productId = Number(insertRes.rows[0].id);
      for (const addonId of input.addon_ids) {
        await client.query(
          'INSERT INTO product_addons (product_id, addon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [productId, addonId],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return { id: productId, products: await fetchProducts(pool, false) };
  },

  async updateProduct(id: number, input: ProductInput): Promise<Product[] | null> {
    const pool = await ensureInitialized();
    const existingRes = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
    if ((existingRes.rowCount ?? 0) === 0) return null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE products SET
          category_id = $1,
          name = $2,
          description = $3,
          price = $4,
          image_url = $5,
          featured = $6,
          active = $7,
          available = $8,
          is_demo = $9
        WHERE id = $10`,
        [
          input.category_id,
          input.name,
          input.description,
          input.price,
          input.image_url,
          input.featured,
          input.active,
          input.available,
          input.is_demo,
          id,
        ],
      );
      await client.query('DELETE FROM product_addons WHERE product_id = $1', [id]);
      for (const addonId of input.addon_ids) {
        await client.query(
          'INSERT INTO product_addons (product_id, addon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, addonId],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return fetchProducts(pool, false);
  },

  async deleteProduct(id: number): Promise<Product[]> {
    const pool = await ensureInitialized();
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    return fetchProducts(pool, false);
  },
};
