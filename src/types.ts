export type StoreStatusMode = 'auto' | 'open' | 'closed';

export type DayKey = 'dom' | 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab';

export interface DaySchedule {
  enabled: boolean;
  open: string;
  close: string;
}

export type WeeklySchedule = Record<DayKey, DaySchedule>;

export interface StoreSettings {
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
  payment_methods: string[];
  store_status_mode: StoreStatusMode;
  schedule: WeeklySchedule;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  active: boolean;
}

export interface Addon {
  id: number;
  name: string;
  price: number;
  active: boolean;
  product_count?: number;
}

export interface Product {
  id: number;
  category_id: number;
  category_name?: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  featured: boolean;
  active: boolean;
  available: boolean;
  is_demo: boolean;
  sort_order: number;
  addons: Addon[];
}

export interface PublicMenuPayload {
  settings: StoreSettings;
  categories: Category[];
  products: Product[];
}

export interface AdminOverviewPayload {
  settings: StoreSettings;
  categories: Category[];
  products: Product[];
  addons: Addon[];
  stats: {
    totalProducts: number;
    totalCategories: number;
    activeProducts: number;
    unavailableProducts: number;
  };
}

export interface CartItem {
  cartItemId: string;
  productId: number;
  name: string;
  image_url: string;
  basePrice: number;
  quantity: number;
  addons: {
    id: number;
    name: string;
    price: number;
  }[];
  notes: string;
}

export type OrderDeliveryType = 'entrega' | 'retirada';

export interface CheckoutFormData {
  customerName: string;
  customerPhone: string;
  deliveryType: OrderDeliveryType;
  streetAddress: string;
  neighborhood: string;
  referencePoint: string;
  paymentMethod: string;
  needsChange: boolean;
  changeFor: string;
  generalNotes: string;
}
