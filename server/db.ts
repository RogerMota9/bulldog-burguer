import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.ts';
import type { DataStore, ProductInput } from './storeTypes.ts';
import { DEFAULT_ADDONS_CATALOG, DEFAULT_PUBLIC_MENU, DEFAULT_WEEKLY_SCHEDULE } from '../src/data/defaultCatalog.ts';
import type { Addon, Category, Product, StoreSettings, StoreStatusMode, WeeklySchedule } from '../src/types.ts';

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
const DB_PATH = path.resolve(DATA_DIR, 'bulldog.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const DEFAULT_ADMIN_EMAIL = (process.env.ADMIN_INITIAL_EMAIL || 'albartholiveira@gmail.com').trim().toLowerCase();
const DEFAULT_INITIAL_HASH =
  process.env.ADMIN_INITIAL_PASSWORD && process.env.ADMIN_INITIAL_PASSWORD.trim().length > 0
    ? hashPassword(process.env.ADMIN_INITIAL_PASSWORD.trim())
    : 'scrypt$70e739a099eab82f92508f7abe428191$479b99b6c35c99cdde2732aa3c76ee9d53880838680f88859224453a6f7cc0ae0845d7e8ca189835c6c6d57c646dc0eae4844fab6cb3d21d72f0e4976fbf3903';

export const DEFAULT_LOGO_URL = '/assets/aistudio/logo_bulldog_ae7e998d.jpeg';

function seedFullCatalogFromDefaults(): void {
  const insertCat = db.prepare(
    'INSERT INTO categories (id, name, slug, description, sort_order, active) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const cat of DEFAULT_PUBLIC_MENU.categories) {
    insertCat.run(cat.id, cat.name, cat.slug, cat.description, cat.sort_order, cat.active ? 1 : 0);
  }

  const insertAddon = db.prepare('INSERT INTO addons (id, name, price, active) VALUES (?, ?, ?, ?)');
  for (const addon of DEFAULT_ADDONS_CATALOG) {
    insertAddon.run(addon.id, addon.name, addon.price, addon.active ? 1 : 0);
  }

  const insertProduct = db.prepare(
    `INSERT INTO products (
      id, category_id, name, description, price, image_url, featured, active, available, is_demo, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const linkAddon = db.prepare('INSERT OR IGNORE INTO product_addons (product_id, addon_id) VALUES (?, ?)');

  for (const prod of DEFAULT_PUBLIC_MENU.products) {
    insertProduct.run(
      prod.id,
      prod.category_id,
      prod.name,
      prod.description,
      prod.price,
      prod.image_url,
      prod.featured ? 1 : 0,
      prod.active ? 1 : 0,
      prod.available ? 1 : 0,
      prod.is_demo ? 1 : 0,
      prod.sort_order,
    );
    for (const addon of prod.addons) {
      linkAddon.run(prod.id, addon.id);
    }
  }
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      delivery_fee REAL NOT NULL DEFAULT 0,
      payment_methods_json TEXT NOT NULL,
      store_status_mode TEXT NOT NULL DEFAULT 'auto',
      schedule_json TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS addons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      image_url TEXT NOT NULL DEFAULT '',
      featured INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      available INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS product_addons (
      product_id INTEGER NOT NULL,
      addon_id INTEGER NOT NULL,
      PRIMARY KEY (product_id, addon_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (addon_id) REFERENCES addons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);

  // Safe column migration for existing DBs
  const settingsCols = db.prepare("PRAGMA table_info('settings')").all() as Array<{ name: string }>;
  const colNames = new Set(settingsCols.map((c) => c.name));
  if (!colNames.has('store_status_mode')) {
    db.exec("ALTER TABLE settings ADD COLUMN store_status_mode TEXT NOT NULL DEFAULT 'auto'");
  }
  if (!colNames.has('schedule_json')) {
    db.exec("ALTER TABLE settings ADD COLUMN schedule_json TEXT NOT NULL DEFAULT ''");
  }

  const existingAdmin = db.prepare('SELECT id FROM admins LIMIT 1').get();
  if (!existingAdmin) {
    db.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)').run(
      DEFAULT_ADMIN_EMAIL,
      DEFAULT_INITIAL_HASH,
    );
  }

  const existingSettings = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!existingSettings) {
    db.prepare(
      `INSERT INTO settings (
        id, store_name, logo_url, banner_title, banner_subtitle, banner_image_url,
        about_title, about_description, about_image_url, whatsapp_number, address,
        opening_hours, contact_info, delivery_fee, payment_methods_json,
        store_status_mode, schedule_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      1,
      'Bulldog',
      DEFAULT_LOGO_URL,
      'Bulldog',
      '',
      '/src/assets/images/hero_bulldog_burger_1795489361996.jpg',
      'Bulldog',
      '',
      '',
      '31973391048',
      '',
      'Todos os dias · 20:00 às 02:00',
      '(31) 97339-1048 · @bulldog_delivery_',
      0,
      JSON.stringify(['Dinheiro', 'Pix', 'Cartão de crédito', 'Cartão de débito']),
      'auto',
      JSON.stringify(DEFAULT_WEEKLY_SCHEDULE),
    );
  }

  const categoryCount = (db.prepare('SELECT COUNT(*) AS count FROM categories').get() as { count: number }).count;
  if (categoryCount === 0) {
    const seedTransaction = db.transaction(() => {
      seedFullCatalogFromDefaults();
    });
    seedTransaction();
  }

  // One-time v2 cleanup for pre-existing seeded DBs so it matches the simplified 4-product storefront + logo
  const userVersion = (db.pragma('user_version', { simple: true }) as number) || 0;
  if (userVersion < 2) {
    const migrateV2 = db.transaction(() => {
      const currentSettings = db.prepare('SELECT logo_url, schedule_json FROM settings WHERE id = 1').get() as
        | { logo_url: string; schedule_json: string }
        | undefined;
      if (currentSettings) {
        if (!currentSettings.logo_url) {
          db.prepare('UPDATE settings SET logo_url = ? WHERE id = 1').run(DEFAULT_LOGO_URL);
        }
        if (!currentSettings.schedule_json) {
          db.prepare('UPDATE settings SET schedule_json = ? WHERE id = 1').run(
            JSON.stringify(DEFAULT_WEEKLY_SCHEDULE),
          );
        }
        db.prepare(
          `UPDATE settings SET banner_title = ?, banner_subtitle = ?, address = ?, contact_info = ? WHERE id = 1`,
        ).run('Bulldog', '', '', '(31) 7339-1048');
      }

      // Remove extra seeded demo items (combos, fries, drinks) if untouched
      db.prepare(
        `DELETE FROM products WHERE is_demo = 1 AND image_url IN (
          '/src/assets/images/combo_bulldog_box_1795489363250.jpg',
          '/src/assets/images/fries_cheddar_bacon_1795489363522.jpg',
          '/src/assets/images/drink_craft_soda_1795489364247.jpg'
        )`,
      ).run();
      db.prepare(`DELETE FROM categories WHERE slug IN ('combos', 'acompanhamentos', 'bebidas')`).run();

      // Clean "(Exemplo)" / AI-like filler from the 4 core products if still demo
      db.prepare(
        `UPDATE products SET name = 'Bulldog Duplo', description = 'Dois hambúrgueres na chapa, queijo derretido, alface, tomate, batata palha e molho da casa.', is_demo = 0, sort_order = 1
         WHERE image_url = '/assets/aistudio/hamburguer_1_8f1db153.jpeg' AND is_demo = 1`,
      ).run();
      db.prepare(
        `UPDATE products SET name = 'Bulldog Clássico', description = 'Pão com gergelim, hambúrguer suculento, queijo derretido, alface, tomate, batata palha e cheddar.', is_demo = 0, sort_order = 2
         WHERE image_url = '/assets/aistudio/hamburguer_2_ace2a5d3.jpeg' AND is_demo = 1`,
      ).run();
      db.prepare(
        `UPDATE products SET name = 'Hot Dog Tradicional', description = 'Pão macio tostado, salsicha grelhada, cheddar cremoso, bacon crocante e batata palha.', is_demo = 0, sort_order = 3
         WHERE image_url = '/src/assets/images/hotdog_bulldog_tradicional_1795489362066.jpg' AND is_demo = 1`,
      ).run();
      db.prepare(
        `UPDATE products SET name = 'Hot Dog Especial Duplo', description = 'Duas salsichas na chapa, queijo maçaricado, bacon em cubos, cebola caramelizada e batata palha.', is_demo = 0, sort_order = 4
         WHERE image_url = '/src/assets/images/hotdog_bulldog_especial_1795489363377.jpg' AND is_demo = 1`,
      ).run();

      db.pragma('user_version = 2');
    });
    migrateV2();
  }

  const vAfter3 = (db.pragma('user_version', { simple: true }) as number) || 0;
  if (vAfter3 < 4) {
    const migrateV4 = db.transaction(() => {
      db.prepare(
        `UPDATE settings SET
          store_name = 'Bulldog',
          banner_title = 'Bulldog',
          about_title = 'Bulldog',
          whatsapp_number = '31973391048',
          opening_hours = 'Todos os dias · 20:00 às 02:00',
          contact_info = '(31) 97339-1048 · @bulldog_delivery_',
          schedule_json = ?
         WHERE id = 1`,
      ).run(JSON.stringify(DEFAULT_WEEKLY_SCHEDULE));

      db.exec(`
        DELETE FROM product_addons;
        DELETE FROM products;
        DELETE FROM addons;
        DELETE FROM categories;
      `);
      seedFullCatalogFromDefaults();
      db.pragma('user_version = 4');
    });
    migrateV4();
  }

  const vAfter4 = (db.pragma('user_version', { simple: true }) as number) || 0;
  if (vAfter4 < 5) {
    const migrateV5 = db.transaction(() => {
      db.prepare(
        `UPDATE products SET name = 'Suco Del Valle Maracujá', description = '290ml · Lata gelada.', image_url = ?, sort_order = 4
         WHERE id = 13`,
      ).run('/assets/aistudio/image_8ff249b7.png');
      db.prepare('UPDATE products SET image_url = ?, sort_order = 7 WHERE id = 14').run(
        '/assets/aistudio/image_a7ab727b.png',
      );
      db.prepare('UPDATE products SET image_url = ?, sort_order = 8 WHERE id = 15').run(
        '/assets/aistudio/image_0a545eb0.png',
      );
      db.prepare('UPDATE products SET image_url = ?, sort_order = 9 WHERE id = 16').run(
        '/assets/aistudio/image_e2a707ca.png',
      );
      db.prepare('UPDATE products SET image_url = ?, sort_order = 10 WHERE id = 17').run(
        '/assets/aistudio/image_4a0ffc19.png',
      );
      db.prepare('UPDATE products SET image_url = ?, sort_order = 11 WHERE id = 18').run(
        '/assets/aistudio/image_5f03f529.png',
      );
      db.prepare('UPDATE products SET image_url = ?, sort_order = 12 WHERE id = 19').run(
        '/assets/aistudio/image_c03ca6c4.png',
      );

      db.prepare(
        `INSERT OR IGNORE INTO products (id, category_id, name, description, price, image_url, featured, active, available, is_demo, sort_order)
         VALUES (20, 4, 'Suco Del Valle Uva', '290ml · Lata gelada.', 6.0, '/assets/aistudio/image_9e373a41.png', 0, 1, 1, 0, 5)`,
      ).run();
      db.prepare(
        `INSERT OR IGNORE INTO products (id, category_id, name, description, price, image_url, featured, active, available, is_demo, sort_order)
         VALUES (21, 4, 'Suco Del Valle Pêssego', '290ml · Lata gelada.', 6.0, '/assets/aistudio/image_2698816d.png', 0, 1, 1, 0, 6)`,
      ).run();

      db.pragma('user_version = 5');
    });
    migrateV5();
  }
}

export function getSettings(): StoreSettings {
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as {
    id: number;
    store_name: string;
    logo_url: string;
    banner_title: string;
    banner_subtitle: string;
    banner_image_url: string;
    about_title: string;
    about_description: string;
    about_image_url: string;
    whatsapp_number: string;
    address: string;
    opening_hours: string;
    contact_info: string;
    delivery_fee: number;
    payment_methods_json: string;
    store_status_mode: string;
    schedule_json: string;
  };

  let paymentMethods: string[] = ['Dinheiro', 'Pix', 'Cartão de crédito', 'Cartão de débito'];
  try {
    const parsed = JSON.parse(row.payment_methods_json);
    if (Array.isArray(parsed)) {
      paymentMethods = parsed.filter((m): m is string => typeof m === 'string' && m.trim().length > 0);
    }
  } catch {
    // keep default
  }

  let schedule: WeeklySchedule = DEFAULT_WEEKLY_SCHEDULE;
  try {
    if (row.schedule_json) {
      const parsed = JSON.parse(row.schedule_json) as Partial<WeeklySchedule>;
      schedule = { ...DEFAULT_WEEKLY_SCHEDULE, ...parsed };
    }
  } catch {
    // keep default
  }

  const mode: StoreStatusMode =
    row.store_status_mode === 'open' || row.store_status_mode === 'closed' ? row.store_status_mode : 'auto';

  return {
    id: row.id,
    store_name: row.store_name,
    logo_url: row.logo_url || DEFAULT_LOGO_URL,
    banner_title: row.banner_title,
    banner_subtitle: row.banner_subtitle,
    banner_image_url: row.banner_image_url,
    about_title: row.about_title,
    about_description: row.about_description,
    about_image_url: row.about_image_url,
    whatsapp_number: row.whatsapp_number,
    address: row.address,
    opening_hours: row.opening_hours,
    contact_info: row.contact_info,
    delivery_fee: Number(row.delivery_fee || 0),
    payment_methods: paymentMethods,
    store_status_mode: mode,
    schedule,
  };
}

export function getCategories(onlyActive = false): Category[] {
  const sql = onlyActive
    ? 'SELECT * FROM categories WHERE active = 1 ORDER BY sort_order ASC, id ASC'
    : 'SELECT * FROM categories ORDER BY sort_order ASC, id ASC';
  const rows = db.prepare(sql).all() as Array<{
    id: number;
    name: string;
    slug: string;
    description: string;
    sort_order: number;
    active: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    sort_order: r.sort_order,
    active: Boolean(r.active),
  }));
}

export function getAddons(onlyActive = false): Addon[] {
  const sql = onlyActive
    ? `SELECT a.*, COUNT(pa.product_id) AS product_count
       FROM addons a
       LEFT JOIN product_addons pa ON pa.addon_id = a.id
       WHERE a.active = 1
       GROUP BY a.id
       ORDER BY a.id ASC`
    : `SELECT a.*, COUNT(pa.product_id) AS product_count
       FROM addons a
       LEFT JOIN product_addons pa ON pa.addon_id = a.id
       GROUP BY a.id
       ORDER BY a.id ASC`;
  const rows = db.prepare(sql).all() as Array<{
    id: number;
    name: string;
    price: number;
    active: number;
    product_count: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    price: Number(r.price),
    active: Boolean(r.active),
    product_count: Number(r.product_count || 0),
  }));
}

export function getProducts(onlyActive = false): Product[] {
  const sql = onlyActive
    ? `SELECT p.*, c.name AS category_name
       FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.active = 1 AND c.active = 1
       ORDER BY c.sort_order ASC, p.sort_order ASC, p.id ASC`
    : `SELECT p.*, c.name AS category_name
       FROM products p
       JOIN categories c ON c.id = p.category_id
       ORDER BY c.sort_order ASC, p.sort_order ASC, p.id ASC`;

  const rows = db.prepare(sql).all() as Array<{
    id: number;
    category_id: number;
    category_name: string;
    name: string;
    description: string;
    price: number;
    image_url: string;
    featured: number;
    active: number;
    available: number;
    is_demo: number;
    sort_order: number;
  }>;

  const addonQuery = onlyActive
    ? `SELECT pa.product_id, a.id, a.name, a.price, a.active
       FROM product_addons pa
       JOIN addons a ON a.id = pa.addon_id
       WHERE a.active = 1
       ORDER BY a.id ASC`
    : `SELECT pa.product_id, a.id, a.name, a.price, a.active
       FROM product_addons pa
       JOIN addons a ON a.id = pa.addon_id
       ORDER BY a.id ASC`;

  const addonRows = db.prepare(addonQuery).all() as Array<{
    product_id: number;
    id: number;
    name: string;
    price: number;
    active: number;
  }>;

  const addonsByProduct = new Map<number, Addon[]>();
  for (const ar of addonRows) {
    const list = addonsByProduct.get(ar.product_id) || [];
    list.push({
      id: ar.id,
      name: ar.name,
      price: Number(ar.price),
      active: Boolean(ar.active),
    });
    addonsByProduct.set(ar.product_id, list);
  }

  return rows.map((r) => ({
    id: r.id,
    category_id: r.category_id,
    category_name: r.category_name,
    name: r.name,
    description: r.description,
    price: Number(r.price),
    image_url: r.image_url,
    featured: Boolean(r.featured),
    active: Boolean(r.active),
    available: Boolean(r.available),
    is_demo: Boolean(r.is_demo),
    sort_order: r.sort_order,
    addons: addonsByProduct.get(r.id) || [],
  }));
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

export const sqliteStore: DataStore = {
  uploadsDir: UPLOADS_DIR,

  async getAdminByEmail(email: string) {
    return db.prepare('SELECT id, email, password_hash FROM admins WHERE email = ?').get(email) as
      | { id: number; email: string; password_hash: string }
      | undefined;
  },

  async updateAdminPassword(email: string, newHash: string) {
    db.prepare('UPDATE admins SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?').run(
      newHash,
      email,
    );
  },

  async saveSession(tokenHash: string, email: string, expiresAt: number) {
    db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare('INSERT OR REPLACE INTO admin_sessions (token_hash, email, expires_at) VALUES (?, ?, ?)').run(
      tokenHash,
      email,
      expiresAt,
    );
  },

  async getSessionByTokenHash(tokenHash: string) {
    const row = db
      .prepare('SELECT token_hash, email, expires_at FROM admin_sessions WHERE token_hash = ?')
      .get(tokenHash) as { token_hash: string; email: string; expires_at: number } | undefined;
    if (!row) return undefined;
    if (row.expires_at <= Date.now()) {
      db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
      return undefined;
    }
    return row;
  },

  async deleteSession(tokenHash: string) {
    db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
  },

  async deleteSessionsByEmail(email: string) {
    db.prepare('DELETE FROM admin_sessions WHERE email = ?').run(email);
  },

  async getSettings() {
    return getSettings();
  },

  async updateSettings(next: StoreSettings) {
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
    );
    return getSettings();
  },

  async getCategories(onlyActive = false) {
    return getCategories(onlyActive);
  },

  async createCategory(name: string, description: string, active: boolean) {
    const maxOrderRow = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM categories').get() as {
      max_order: number;
    };
    let slug = slugify(name);
    const dup = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
    if (dup) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }
    db.prepare('INSERT INTO categories (name, slug, description, sort_order, active) VALUES (?, ?, ?, ?, ?)').run(
      name,
      slug,
      description,
      maxOrderRow.max_order + 1,
      active ? 1 : 0,
    );
    return getCategories(false);
  },

  async updateCategory(id: number, name: string, description: string, active: boolean) {
    const existing = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
    if (!existing) return null;
    db.prepare('UPDATE categories SET name = ?, description = ?, active = ? WHERE id = ?').run(
      name,
      description,
      active ? 1 : 0,
      id,
    );
    return getCategories(false);
  },

  async reorderCategories(orderedIds: number[]) {
    const updateStmt = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
    const tx = db.transaction((ids: number[]) => {
      ids.forEach((id, idx) => updateStmt.run(idx + 1, id));
    });
    tx(orderedIds);
    return getCategories(false);
  },

  async deleteCategory(id: number) {
    const productCount = (
      db.prepare('SELECT COUNT(*) AS count FROM products WHERE category_id = ?').get(id) as { count: number }
    ).count;
    if (productCount > 0) {
      return {
        ok: false as const,
        error: `Esta categoria possui ${productCount} produto(s). Mova ou exclua os produtos antes de remover a categoria.`,
      };
    }
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    return { ok: true as const, categories: getCategories(false) };
  },

  async getAddons(onlyActive = false) {
    return getAddons(onlyActive);
  },

  async createAddon(name: string, price: number, active: boolean) {
    const info = db
      .prepare('INSERT INTO addons (name, price, active) VALUES (?, ?, ?)')
      .run(name, price, active ? 1 : 0);
    return { id: Number(info.lastInsertRowid), addons: getAddons(false) };
  },

  async updateAddon(id: number, name: string, price: number, active: boolean) {
    db.prepare('UPDATE addons SET name = ?, price = ?, active = ? WHERE id = ?').run(
      name,
      price,
      active ? 1 : 0,
      id,
    );
    return getAddons(false);
  },

  async deleteAddon(id: number) {
    db.prepare('DELETE FROM addons WHERE id = ?').run(id);
    return getAddons(false);
  },

  async getProducts(onlyActive = false) {
    return getProducts(onlyActive);
  },

  async createProduct(input: ProductInput) {
    const maxSort = (
      db
        .prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM products WHERE category_id = ?')
        .get(input.category_id) as { max_order: number }
    ).max_order;

    const tx = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO products (
            category_id, name, description, price, image_url, featured, active, available, is_demo, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.category_id,
          input.name,
          input.description,
          input.price,
          input.image_url,
          input.featured ? 1 : 0,
          input.active ? 1 : 0,
          input.available ? 1 : 0,
          input.is_demo ? 1 : 0,
          maxSort + 1,
        );

      const productId = Number(info.lastInsertRowid);
      const linkStmt = db.prepare('INSERT OR IGNORE INTO product_addons (product_id, addon_id) VALUES (?, ?)');
      for (const addonId of input.addon_ids) {
        linkStmt.run(productId, addonId);
      }
      return productId;
    });

    const id = tx();
    return { id, products: getProducts(false) };
  },

  async updateProduct(id: number, input: ProductInput) {
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
    if (!existing) return null;

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
      ).run(
        input.category_id,
        input.name,
        input.description,
        input.price,
        input.image_url,
        input.featured ? 1 : 0,
        input.active ? 1 : 0,
        input.available ? 1 : 0,
        input.is_demo ? 1 : 0,
        id,
      );

      db.prepare('DELETE FROM product_addons WHERE product_id = ?').run(id);
      const linkStmt = db.prepare('INSERT OR IGNORE INTO product_addons (product_id, addon_id) VALUES (?, ?)');
      for (const addonId of input.addon_ids) {
        linkStmt.run(id, addonId);
      }
    });

    tx();
    return getProducts(false);
  },

  async deleteProduct(id: number) {
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    return getProducts(false);
  },
};
