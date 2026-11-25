import type { Addon, Category, Product, StoreSettings } from '../src/types.ts';

export interface AdminRecord {
  id: number;
  email: string;
  password_hash: string;
}

export interface AdminSessionRecord {
  token_hash: string;
  email: string;
  expires_at: number;
}

export interface ProductInput {
  category_id: number;
  name: string;
  description: string;
  price: number;
  image_url: string;
  featured: boolean;
  active: boolean;
  available: boolean;
  is_demo: boolean;
  addon_ids: number[];
}

export interface DataStore {
  uploadsDir: string;
  getAdminByEmail(email: string): Promise<AdminRecord | undefined>;
  updateAdminPassword(email: string, newHash: string): Promise<void>;
  saveSession(tokenHash: string, email: string, expiresAt: number): Promise<void>;
  getSessionByTokenHash(tokenHash: string): Promise<AdminSessionRecord | undefined>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsByEmail(email: string): Promise<void>;
  getSettings(): Promise<StoreSettings>;
  updateSettings(settings: StoreSettings): Promise<StoreSettings>;
  getCategories(onlyActive?: boolean): Promise<Category[]>;
  createCategory(name: string, description: string, active: boolean): Promise<Category[]>;
  updateCategory(id: number, name: string, description: string, active: boolean): Promise<Category[] | null>;
  reorderCategories(orderedIds: number[]): Promise<Category[]>;
  deleteCategory(id: number): Promise<{ ok: true; categories: Category[] } | { ok: false; error: string }>;
  getAddons(onlyActive?: boolean): Promise<Addon[]>;
  createAddon(name: string, price: number, active: boolean): Promise<{ id: number; addons: Addon[] }>;
  updateAddon(id: number, name: string, price: number, active: boolean): Promise<Addon[]>;
  deleteAddon(id: number): Promise<Addon[]>;
  getProducts(onlyActive?: boolean): Promise<Product[]>;
  createProduct(input: ProductInput): Promise<{ id: number; products: Product[] }>;
  updateProduct(id: number, input: ProductInput): Promise<Product[] | null>;
  deleteProduct(id: number): Promise<Product[]>;
}
