import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.ts';
import type { AdminRecord, AdminSessionRecord, DataStore, ProductInput } from './storeTypes.ts';
import { DEFAULT_ADDONS_CATALOG, DEFAULT_PUBLIC_MENU } from '../src/data/defaultCatalog.ts';
import type { Addon, Category, Product, StoreSettings } from '../src/types.ts';

const TMP_BASE = '/tmp/bulldog';
export const VERCEL_UPLOADS_DIR = path.resolve(TMP_BASE, 'uploads');
const STORE_FILE = path.resolve(TMP_BASE, 'store_v5.json');

const DEFAULT_ADMIN_EMAIL = (process.env.ADMIN_INITIAL_EMAIL || 'albartholiveira@gmail.com').trim().toLowerCase();
const DEFAULT_INITIAL_HASH =
  process.env.ADMIN_INITIAL_PASSWORD && process.env.ADMIN_INITIAL_PASSWORD.trim().length > 0
    ? hashPassword(process.env.ADMIN_INITIAL_PASSWORD.trim())
    : 'scrypt$70e739a099eab82f92508f7abe428191$479b99b6c35c99cdde2732aa3c76ee9d53880838680f88859224453a6f7cc0ae0845d7e8ca189835c6c6d57c646dc0eae4844fab6cb3d21d72f0e4976fbf3903';

interface JsonStoreState {
  admins: AdminRecord[];
  sessions?: AdminSessionRecord[];
  settings: StoreSettings;
  categories: Category[];
  addons: Array<{ id: number; name: string; price: number; active: boolean }>;
  products: Array<Omit<Product, 'category_name' | 'addons'> & { addon_ids: number[] }>;
  nextId: { category: number; addon: number; product: number };
}

function createInitialState(): JsonStoreState {
  return {
    admins: [{ id: 1, email: DEFAULT_ADMIN_EMAIL, password_hash: DEFAULT_INITIAL_HASH }],
    settings: structuredClone(DEFAULT_PUBLIC_MENU.settings),
    categories: structuredClone(DEFAULT_PUBLIC_MENU.categories),
    addons: DEFAULT_ADDONS_CATALOG.map((a) => ({ id: a.id, name: a.name, price: a.price, active: a.active })),
    products: DEFAULT_PUBLIC_MENU.products.map((p) => ({
      id: p.id,
      category_id: p.category_id,
      name: p.name,
      description: p.description,
      price: p.price,
      image_url: p.image_url,
      featured: p.featured,
      active: p.active,
      available: p.available,
      is_demo: p.is_demo,
      sort_order: p.sort_order,
      addon_ids: p.addons.map((a) => a.id),
    })),
    nextId: {
      category: DEFAULT_PUBLIC_MENU.categories.length + 1,
      addon: DEFAULT_ADDONS_CATALOG.length + 1,
      product: DEFAULT_PUBLIC_MENU.products.length + 1,
    },
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

  async getAdminByEmail(email: string): Promise<AdminRecord | undefined> {
    const state = loadState();
    return state.admins.find((a) => a.email === email);
  },

  async updateAdminPassword(email: string, newHash: string): Promise<void> {
    const state = loadState();
    const admin = state.admins.find((a) => a.email === email);
    if (admin) {
      admin.password_hash = newHash;
      saveState(state);
    }
  },

  async saveSession(tokenHash: string, email: string, expiresAt: number): Promise<void> {
    const state = loadState();
    const now = Date.now();
    state.sessions = (state.sessions || []).filter((s) => s.expires_at > now && s.token_hash !== tokenHash);
    state.sessions.push({ token_hash: tokenHash, email, expires_at: expiresAt });
    saveState(state);
  },

  async getSessionByTokenHash(tokenHash: string): Promise<AdminSessionRecord | undefined> {
    const state = loadState();
    const found = (state.sessions || []).find((s) => s.token_hash === tokenHash);
    if (!found) return undefined;
    if (found.expires_at <= Date.now()) {
      state.sessions = (state.sessions || []).filter((s) => s.token_hash !== tokenHash);
      saveState(state);
      return undefined;
    }
    return found;
  },

  async deleteSession(tokenHash: string): Promise<void> {
    const state = loadState();
    state.sessions = (state.sessions || []).filter((s) => s.token_hash !== tokenHash);
    saveState(state);
  },

  async deleteSessionsByEmail(email: string): Promise<void> {
    const state = loadState();
    state.sessions = (state.sessions || []).filter((s) => s.email !== email);
    saveState(state);
  },

  async getSettings(): Promise<StoreSettings> {
    return loadState().settings;
  },

  async updateSettings(settings: StoreSettings): Promise<StoreSettings> {
    const state = loadState();
    state.settings = settings;
    saveState(state);
    return state.settings;
  },

  async getCategories(onlyActive = false): Promise<Category[]> {
    const state = loadState();
    return [...state.categories]
      .filter((c) => (onlyActive ? c.active : true))
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  },

  async createCategory(name: string, description: string, active: boolean): Promise<Category[]> {
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

  async updateCategory(id: number, name: string, description: string, active: boolean): Promise<Category[] | null> {
    const state = loadState();
    const cat = state.categories.find((c) => c.id === id);
    if (!cat) return null;
    cat.name = name;
    cat.description = description;
    cat.active = active;
    saveState(state);
    return this.getCategories(false);
  },

  async reorderCategories(orderedIds: number[]): Promise<Category[]> {
    const state = loadState();
    orderedIds.forEach((id, idx) => {
      const cat = state.categories.find((c) => c.id === id);
      if (cat) cat.sort_order = idx + 1;
    });
    saveState(state);
    return this.getCategories(false);
  },

  async deleteCategory(id: number): Promise<{ ok: true; categories: Category[] } | { ok: false; error: string }> {
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
    return { ok: true, categories: await this.getCategories(false) };
  },

  async getAddons(onlyActive = false): Promise<Addon[]> {
    const state = loadState();
    return state.addons
      .filter((a) => (onlyActive ? a.active : true))
      .map((a) => ({
        ...a,
        product_count: state.products.filter((p) => p.addon_ids.includes(a.id)).length,
      }));
  },

  async createAddon(name: string, price: number, active: boolean): Promise<{ id: number; addons: Addon[] }> {
    const state = loadState();
    const id = state.nextId.addon++;
    state.addons.push({ id, name, price, active });
    saveState(state);
    return { id, addons: await this.getAddons(false) };
  },

  async updateAddon(id: number, name: string, price: number, active: boolean): Promise<Addon[]> {
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

  async deleteAddon(id: number): Promise<Addon[]> {
    const state = loadState();
    state.addons = state.addons.filter((a) => a.id !== id);
    state.products.forEach((p) => {
      p.addon_ids = p.addon_ids.filter((aid) => aid !== id);
    });
    saveState(state);
    return this.getAddons(false);
  },

  async getProducts(onlyActive = false): Promise<Product[]> {
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

  async createProduct(input: ProductInput): Promise<{ id: number; products: Product[] }> {
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
    return { id, products: await this.getProducts(false) };
  },

  async updateProduct(id: number, input: ProductInput): Promise<Product[] | null> {
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

  async deleteProduct(id: number): Promise<Product[]> {
    const state = loadState();
    state.products = state.products.filter((p) => p.id !== id);
    saveState(state);
    return this.getProducts(false);
  },
};
