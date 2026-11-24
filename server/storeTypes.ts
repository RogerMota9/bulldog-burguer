import type { Addon, Category, Product, StoreSettings } from '../src/types.ts';

export interface AdminRecord {
  id: number;
  email: string;
  password_hash: string;
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
  getAdminByEmail(email: string): AdminRecord | undefined;
  updateAdminPassword(email: string, newHash: string): void;
  getSettings(): StoreSettings;
  updateSettings(settings: StoreSettings): StoreSettings;
  getCategories(onlyActive?: boolean): Category[];
  createCategory(name: string, description: string, active: boolean): Category[];
  updateCategory(id: number, name: string, description: string, active: boolean): Category[] | null;
  reorderCategories(orderedIds: number[]): Category[];
  deleteCategory(id: number): { ok: true; categories: Category[] } | { ok: false; error: string };
  getAddons(onlyActive?: boolean): Addon[];
  createAddon(name: string, price: number, active: boolean): { id: number; addons: Addon[] };
  updateAddon(id: number, name: string, price: number, active: boolean): Addon[];
  deleteAddon(id: number): Addon[];
  getProducts(onlyActive?: boolean): Product[];
  createProduct(input: ProductInput): { id: number; products: Product[] };
  updateProduct(id: number, input: ProductInput): Product[] | null;
  deleteProduct(id: number): Product[];
}
