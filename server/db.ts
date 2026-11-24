import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.ts';
import type { Addon, Category, Product, StoreSettings, StoreStatusMode, WeeklySchedule } from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
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

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  dom: { enabled: true, open: '18:30', close: '23:30' },
  seg: { enabled: false, open: '18:30', close: '23:30' },
  ter: { enabled: true, open: '18:30', close: '23:30' },
  qua: { enabled: true, open: '18:30', close: '23:30' },
  qui: { enabled: true, open: '18:30', close: '23:30' },
  sex: { enabled: true, open: '18:30', close: '23:59' },
  sab: { enabled: true, open: '18:30', close: '23:59' },
};

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
      'Bulldog Hamburgueria',
      DEFAULT_LOGO_URL,
      'Bulldog Hamburgueria',
      '',
      '/src/assets/images/hero_bulldog_burger_1795489361996.jpg',
      'Bulldog Hamburgueria',
      '',
      '',
      '3173391048',
      '',
      'Terça a Domingo · 18h30 às 23h30',
      '(31) 7339-1048',
      0,
      JSON.stringify(['Dinheiro', 'Pix', 'Cartão de crédito', 'Cartão de débito']),
      'auto',
      JSON.stringify(DEFAULT_WEEKLY_SCHEDULE),
    );
  }

  const categoryCount = (db.prepare('SELECT COUNT(*) AS count FROM categories').get() as { count: number }).count;
  if (categoryCount === 0) {
    const insertCat = db.prepare(
      'INSERT INTO categories (name, slug, description, sort_order, active) VALUES (?, ?, ?, ?, ?)',
    );
    const seedTransaction = db.transaction(() => {
      const c1 = insertCat.run('Hambúrgueres', 'hamburgueres', '', 1, 1);
      const c2 = insertCat.run('Hot Dogs', 'hot-dogs', '', 2, 1);

      const insertAddon = db.prepare('INSERT INTO addons (name, price, active) VALUES (?, ?, ?)');
      const aBacon = Number(insertAddon.run('Bacon extra', 5.0, 1).lastInsertRowid);
      const aQueijo = Number(insertAddon.run('Queijo mussarela', 4.0, 1).lastInsertRowid);
      const aCheddar = Number(insertAddon.run('Cheddar cremoso', 4.5, 1).lastInsertRowid);
      const aOvo = Number(insertAddon.run('Ovo na chapa', 3.0, 1).lastInsertRowid);
      const aMolho = Number(insertAddon.run('Molho especial', 3.0, 1).lastInsertRowid);

      const insertProduct = db.prepare(
        `INSERT INTO products (
          category_id, name, description, price, image_url, featured, active, available, is_demo, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const linkAddon = db.prepare('INSERT INTO product_addons (product_id, addon_id) VALUES (?, ?)');

      const p1 = Number(
        insertProduct.run(
          c1.lastInsertRowid,
          'Bulldog Duplo',
          'Dois hambúrgueres na chapa, queijo derretido, alface, tomate, batata palha e molho da casa.',
          32.9,
          '/assets/aistudio/hamburguer_1_8f1db153.jpeg',
          1,
          1,
          1,
          0,
          1,
        ).lastInsertRowid,
      );

      const p2 = Number(
        insertProduct.run(
          c1.lastInsertRowid,
          'Bulldog Clássico',
          'Pão com gergelim, hambúrguer suculento, queijo derretido, alface, tomate, batata palha e cheddar.',
          28.9,
          '/assets/aistudio/hamburguer_2_ace2a5d3.jpeg',
          1,
          1,
          1,
          0,
          2,
        ).lastInsertRowid,
      );

      const p3 = Number(
        insertProduct.run(
          c2.lastInsertRowid,
          'Hot Dog Tradicional',
          'Pão macio tostado, salsicha grelhada, cheddar cremoso, bacon crocante e batata palha.',
          19.9,
          '/src/assets/images/hotdog_bulldog_tradicional_1795489362066.jpg',
          1,
          1,
          1,
          0,
          3,
        ).lastInsertRowid,
      );

      const p4 = Number(
        insertProduct.run(
          c2.lastInsertRowid,
          'Hot Dog Especial Duplo',
          'Duas salsichas na chapa, queijo maçaricado, bacon em cubos, cebola caramelizada e batata palha.',
          25.9,
          '/src/assets/images/hotdog_bulldog_especial_1795489363377.jpg',
          1,
          1,
          1,
          0,
          4,
        ).lastInsertRowid,
      );

      for (const pid of [p1, p2, p3, p4]) {
        for (const aid of [aBacon, aQueijo, aCheddar, aOvo, aMolho]) {
          linkAddon.run(pid, aid);
        }
      }
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
        ).run('Bulldog Hamburgueria', '', '', '(31) 7339-1048');
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
