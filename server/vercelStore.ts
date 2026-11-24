import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.ts';
import type { AdminRecord, DataStore, ProductInput } from './storeTypes.ts';
import type { Addon, Category, Product, StoreSettings, WeeklySchedule } from '../src/types.ts';

const TMP_BASE = '/tmp/bulldog';
export const VERCEL_UPLOADS_DIR = path.resolve(TMP_BASE, 'uploads');
const STORE_FILE = path.resolve(TMP_BASE, 'store.json');

const DEFAULT_ADMIN_EMAIL = (process.env.ADMIN_INITIAL_EMAIL || 'albartholiveira@gmail.com').trim().toLowerCase();
const DEFAULT_INITIAL_HASH =
  process.env.ADMIN_INITIAL_PASSWORD && process.env.ADMIN_INITIAL_PASSWORD.trim().length > 0
    ? hashPassword(process.env.ADMIN_INITIAL_PASSWORD.trim())
    : 'scrypt$70e739a099eab82f92508f7abe428191$479b99b6c35c99cdde2732aa3c76ee9d53880838680f88859224453a6f7cc0ae0845d7e8ca189835c6c6d57c646dc0eae4844fab6cb3d21d72f0e4976fbf3903';

const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  dom: { enabled: true, open: '18:30', close: '23:30' },
  seg: { enabled: false, open: '18:30', close: '23:30' },
  ter: { enabled: true, open: '18:30', close: '23:30' },
  qua: { enabled: true, open: '18:30', close: '23:30' },
  qui: { enabled: true, open: '18:30', close: '23:30' },
  sex: { enabled: true, open: '18:30', close: '23:59' },
  sab: { enabled: true, open: '18:30', close: '23:59' },
};

interface JsonStoreState {
  admins: AdminRecord[];
  settings: StoreSettings;
  categories: Category[];
  addons: Array<{ id: number; name: string; price: number; active: boolean }>;
  products: Array<Omit<Product, 'category_name' | 'addons'> & { addon_ids: number[] }>;
  nextId: { category: number; addon: number; product: number };
}

function createInitialState(): JsonStoreState {
  return {
    admins: [{ id: 1, email: DEFAULT_ADMIN_EMAIL, password_hash: DEFAULT_INITIAL_HASH }],
    settings: {
      id: 1,
      store_name: 'Bulldog',
      logo_url: '/assets/aistudio/logo_bulldog_ae7e998d.jpeg',
      banner_title: 'Bulldog',
      banner_subtitle: '',
      banner_image_url: '/src/assets/images/hero_bulldog_burger_1795489361996.jpg',
      about_title: 'Bulldog',
      about_description: '',
      about_image_url: '',
      whatsapp_number: '3173391048',
      address: '',
      opening_hours: 'Terça a Domingo · 18h30 às 23h30',
      contact_info: '(31) 7339-1048',
      delivery_fee: 0,
      payment_methods: ['Dinheiro', 'Pix', 'Cartão de crédito', 'Cartão de débito'],
      store_status_mode: 'auto',
      schedule: DEFAULT_WEEKLY_SCHEDULE,
    },
    categories: [
      { id: 1, name: 'Hambúrgueres', slug: 'hamburgueres', description: '', sort_order: 1, active: true },
      { id: 2, name: 'Hot Dogs', slug: 'hot-dogs', description: '', sort_order: 2, active: true },
    ],
    addons: [
      { id: 1, name: 'Bacon extra', price: 5.0, active: true },
      { id: 2, name: 'Queijo mussarela', price: 4.0, active: true },
      { id: 3, name: 'Cheddar cremoso', price: 4.5, active: true },
      { id: 4, name: 'Ovo na chapa', price: 3.0, active: true },
      { id: 5, name: 'Molho especial', price: 3.0, active: true },
    ],
    products: [
      {
        id: 1,
        category_id: 1,
        name: 'Bulldog Duplo',
        description:
          'Dois hambúrgueres na chapa, queijo derretido, alface, tomate, batata palha e molho da casa.',
        price: 32.9,
        image_url: '/assets/aistudio/hamburguer_1_8f1db153.jpeg',
        featured: true,
        active: true,
        available: true,
        is_demo: false,
        sort_order: 1,
        addon_ids: [1, 2, 3, 4, 5],
      },
      {
        id: 2,
        category_id: 1,
        name: 'Bulldog Clássico',
        description:
          'Pão com gergelim, hambúrguer suculento, queijo derretido, alface, tomate, batata palha e cheddar.',
        price: 28.9,
        image_url: '/assets/aistudio/hamburguer_2_ace2a5d3.jpeg',
        featured: true,
        active: true,
        available: true,
        is_demo: false,
        sort_order: 2,
        addon_ids: [1, 2, 3, 4, 5],
      },
      {
        id: 3,
        category_id: 2,
        name: 'Hot Dog Tradicional',
        description:
          'Pão macio tostado, salsicha grelhada, cheddar cremoso, bacon crocante e batata palha.',
        price: 19.9,
        image_url: '/src/assets/images/hotdog_bulldog_tradicional_1795489362066.jpg',
        featured: true,
        active: true,
        available: true,
        is_demo: false,
        sort_order: 3,
        addon_ids: [1, 2, 3, 4, 5],
      },
      {
        id: 4,
        category_id: 2,
        name: 'Hot Dog Especial Duplo',
        description:
          'Duas salsichas na chapa, queijo maçaricado, bacon em cubos, cebola caramelizada e batata palha.',
        price: 25.9,
        image_url: '/src/assets/images/hotdog_bulldog_especial_1795489363377.jpg',
        featured: true,
        active: true,
        available: true,
        is_demo: false,
        sort_order: 4,
        addon_ids: [1, 2, 3, 4, 5],
      },
    ],
    nextId: { category: 3, addon: 6, product: 5 },
  };
}

let memoryState: JsonStoreState | null = null;

function ensureDirs(): void {
  try {
    fs.mkdirSync(VERCEL_UPLOADS_DIR, { recursive: true });
  } catch {
    // ignore if readonly
  }
}

function loadState(): JsonStoreState {
  ensureDirs();
  if (memoryState) return memoryState;
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      memoryState = JSON.parse(raw) as JsonStoreState;
      return memoryState;
    }
  } catch {
    // fall back to initial state
  }
  memoryState = createInitialState();
  saveState(memoryState);
  return memoryState;
}

function saveState(state: JsonStoreState): void {
  memoryState = state;
  try {
    ensureDirs();
    fs.writeFileSync(STORE_FILE, JSON.stringify(state), 'utf8');
  } catch {
    // memoryState still retains updates within the warm instance
  }
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

export const vercelStore: DataStore = {
  uploadsDir: VERCEL_UPLOADS_DIR,

  getAdminByEmail(email: string): AdminRecord | undefined {
    const state = loadState();
    return state.admins.find((a) => a.email === email);
  },

  updateAdminPassword(email: string, newHash: string): void {
    const state = loadState();
    const admin = state.admins.find((a) => a.email === email);
    if (admin) {
      admin.password_hash = newHash;
      saveState(state);
    }
  },

  getSettings(): StoreSettings {
    return loadState().settings;
  },

  updateSettings(settings: StoreSettings): StoreSettings {
    const state = loadState();
    state.settings = settings;
    saveState(state);
    return state.settings;
  },

  getCategories(onlyActive = false): Category[] {
    const state = loadState();
    return [...state.categories]
      .filter((c) => (onlyActive ? c.active : true))
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  },

  createCategory(name: string, description: string, active: boolean): Category[] {
    const state = loadState();
    const maxOrder = state.categories.reduce((m, c) => Math.max(m, c.sort_order), 0);
    let slug = slugify(name);
    if (state.categories.some((c) => c.slug === slug)) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }
    state.categories.push({
      id: state.nextId.category++,
      name,
      slug,
      description,
      sort_order: maxOrder + 1,
      active,
    });
    saveState(state);
    return this.getCategories(false);
  },

  updateCategory(id: number, name: string, description: string, active: boolean): Category[] | null {
    const state = loadState();
    const cat = state.categories.find((c) => c.id === id);
    if (!cat) return null;
    cat.name = name;
    cat.description = description;
    cat.active = active;
    saveState(state);
    return this.getCategories(false);
  },

  reorderCategories(orderedIds: number[]): Category[] {
    const state = loadState();
    orderedIds.forEach((id, idx) => {
      const cat = state.categories.find((c) => c.id === id);
      if (cat) cat.sort_order = idx + 1;
    });
    saveState(state);
    return this.getCategories(false);
  },

  deleteCategory(id: number): { ok: true; categories: Category[] } | { ok: false; error: string } {
    const state = loadState();
    const count = state.products.filter((p) => p.category_id === id).length;
    if (count > 0) {
      return {
        ok: false,
        error: `Esta categoria possui ${count} produto(s). Mova ou exclua os produtos antes de remover a categoria.`,
      };
    }
    state.categories = state.categories.filter((c) => c.id !== id);
    saveState(state);
    return { ok: true, categories: this.getCategories(false) };
  },

  getAddons(onlyActive = false): Addon[] {
    const state = loadState();
    return state.addons
      .filter((a) => (onlyActive ? a.active : true))
      .map((a) => ({
        ...a,
        product_count: state.products.filter((p) => p.addon_ids.includes(a.id)).length,
      }));
  },

  createAddon(name: string, price: number, active: boolean): { id: number; addons: Addon[] } {
    const state = loadState();
    const id = state.nextId.addon++;
    state.addons.push({ id, name, price, active });
    saveState(state);
    return { id, addons: this.getAddons(false) };
  },

  updateAddon(id: number, name: string, price: number, active: boolean): Addon[] {
    const state = loadState();
    const addon = state.addons.find((a) => a.id === id);
    if (addon) {
      addon.name = name;
      addon.price = price;
      addon.active = active;
      saveState(state);
    }
    return this.getAddons(false);
  },

  deleteAddon(id: number): Addon[] {
    const state = loadState();
    state.addons = state.addons.filter((a) => a.id !== id);
    state.products.forEach((p) => {
      p.addon_ids = p.addon_ids.filter((aid) => aid !== id);
    });
    saveState(state);
    return this.getAddons(false);
  },

  getProducts(onlyActive = false): Product[] {
    const state = loadState();
    const catMap = new Map(state.categories.map((c) => [c.id, c]));
    return [...state.products]
      .filter((p) => {
        const cat = catMap.get(p.category_id);
        if (!cat) return false;
        return onlyActive ? p.active && cat.active : true;
      })
      .sort((a, b) => {
        const catA = catMap.get(a.category_id)?.sort_order ?? 0;
        const catB = catMap.get(b.category_id)?.sort_order ?? 0;
        return catA - catB || a.sort_order - b.sort_order || a.id - b.id;
      })
      .map((p) => ({
        id: p.id,
        category_id: p.category_id,
        category_name: catMap.get(p.category_id)?.name || '',
        name: p.name,
        description: p.description,
        price: p.price,
        image_url: p.image_url,
        featured: p.featured,
        active: p.active,
        available: p.available,
        is_demo: p.is_demo,
        sort_order: p.sort_order,
        addons: state.addons
          .filter((a) => p.addon_ids.includes(a.id) && (onlyActive ? a.active : true))
          .map((a) => ({ id: a.id, name: a.name, price: a.price, active: a.active })),
      }));
  },

  createProduct(input: ProductInput): { id: number; products: Product[] } {
    const state = loadState();
    const maxSort = state.products
      .filter((p) => p.category_id === input.category_id)
      .reduce((m, p) => Math.max(m, p.sort_order), 0);
    const id = state.nextId.product++;
    state.products.push({
      id,
      category_id: input.category_id,
      name: input.name,
      description: input.description,
      price: input.price,
      image_url: input.image_url,
      featured: input.featured,
      active: input.active,
      available: input.available,
      is_demo: input.is_demo,
      sort_order: maxSort + 1,
      addon_ids: input.addon_ids,
    });
    saveState(state);
    return { id, products: this.getProducts(false) };
  },

  updateProduct(id: number, input: ProductInput): Product[] | null {
    const state = loadState();
    const prod = state.products.find((p) => p.id === id);
    if (!prod) return null;
    prod.category_id = input.category_id;
    prod.name = input.name;
    prod.description = input.description;
    prod.price = input.price;
    prod.image_url = input.image_url;
    prod.featured = input.featured;
    prod.active = input.active;
    prod.available = input.available;
    prod.is_demo = input.is_demo;
    prod.addon_ids = input.addon_ids;
    saveState(state);
    return this.getProducts(false);
  },

  deleteProduct(id: number): Product[] {
    const state = loadState();
    state.products = state.products.filter((p) => p.id !== id);
    saveState(state);
    return this.getProducts(false);
  },
};
