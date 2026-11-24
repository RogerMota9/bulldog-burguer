import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Lock,
  MapPin,
  Plus,
  ShoppingBag,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { BrandWordmark, SafeFoodImage } from './components/BulldogLogo';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { ProductModal } from './components/ProductModal';
import type { CartItem, Product, PublicMenuPayload } from './types';
import {
  formatCurrency,
  getCartSubtotal,
  getStoreOpenStatus,
  ORDERED_DAYS,
} from './utils/format';

const CART_STORAGE_KEY = 'bulldog_cart_v1';

function loadStoredCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [view, setView] = useState<'storefront' | 'admin'>(() =>
    typeof window !== 'undefined' && window.location.hash === '#admin' ? 'admin' : 'storefront',
  );
  const [menuData, setMenuData] = useState<PublicMenuPayload | null>(null);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [menuError, setMenuError] = useState('');
  const [hoursOpen, setHoursOpen] = useState(false);

  const [cart, setCart] = useState<CartItem[]>(loadStoredCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  const [cartToast, setCartToast] = useState('');

  const fetchMenu = useCallback(async () => {
    try {
      const res = await fetch('/api/menu');
      if (!res.ok) throw new Error('Erro ao carregar cardápio');
      const data = (await res.json()) as PublicMenuPayload;
      setMenuData(data);
      setMenuError('');
    } catch {
      setMenuError('Não foi possível carregar o cardápio. Tente recarregar a página.');
    } finally {
      setLoadingMenu(false);
    }
  }, []);

  useEffect(() => {
    void fetchMenu();
  }, [fetchMenu]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage quota errors
    }
  }, [cart]);

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#admin') {
        setView('admin');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateToAdmin = () => {
    window.location.hash = 'admin';
    setView('admin');
  };

  const navigateToStorefront = () => {
    if (window.location.hash === '#admin') {
      history.replaceState(null, '', '#cardapio');
    }
    setView('storefront');
  };

  const showCartFeedback = (message: string) => {
    setCartToast(message);
    setTimeout(() => {
      setCartToast((prev) => (prev === message ? '' : prev));
    }, 2200);
  };

  const handleConfirmProduct = (item: CartItem) => {
    setCart((prev) => {
      const existingIdx = prev.findIndex((c) => c.cartItemId === item.cartItemId);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = item;
        return next;
      }
      return [...prev, item];
    });
    const wasEditing = Boolean(editingCartItem);
    setActiveProduct(null);
    setEditingCartItem(null);
    showCartFeedback(wasEditing ? 'Item atualizado' : `${item.name} adicionado`);
  };

  const handleUpdateQuantity = (cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.cartItemId === cartItemId ? { ...item, quantity: item.quantity + delta } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const handleRemoveItem = (cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
  };

  const handleEditCartItem = (item: CartItem) => {
    const prod = menuData?.products.find((p) => p.id === item.productId);
    if (!prod) return;
    setCartOpen(false);
    setEditingCartItem(item);
    setActiveProduct(prod);
  };

  const totalCartItems = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );
  const cartSubtotal = useMemo(() => getCartSubtotal(cart), [cart]);

  if (view === 'admin') {
    return (
      <AdminPanel
        onBackToMenu={navigateToStorefront}
        onDataChanged={() => {
          void fetchMenu();
        }}
      />
    );
  }

  const settings = menuData?.settings;
  const products = menuData?.products || [];
  const storeStatus = settings ? getStoreOpenStatus(settings) : null;

  return (
    <div className="min-h-screen bg-charcoal-texture text-zinc-100 flex flex-col">
      {/* TOP BAR */}
      <header className="sticky top-0 z-40 h-14 bg-[#0B0B0E]/92 backdrop-blur-md border-b border-white/10">
        <div className="max-w-4xl mx-auto h-full px-4 flex items-center justify-between gap-4">
          <a href="#topo" className="whitespace-nowrap shrink-0">
            <BrandWordmark
              logoUrl={settings?.logo_url}
              storeName={settings?.store_name || 'BULLDOG'}
              size="sm"
            />
          </a>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={navigateToAdmin}
              className="text-xs font-medium text-zinc-400 hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Admin</span>
            </button>

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Carrinho</span>
              <span className="font-mono tabular-nums">({totalCartItems})</span>
            </button>
          </div>
        </div>
      </header>

      {loadingMenu ? (
        <main className="flex-1 flex items-center justify-center px-4 py-24">
          <p className="text-sm text-zinc-400">Carregando cardápio...</p>
        </main>
      ) : menuError || !menuData || !settings ? (
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-24 text-center">
          <p className="text-base text-red-300 mb-4">{menuError || 'Cardápio indisponível.'}</p>
          <button
            type="button"
            onClick={() => void fetchMenu()}
            className="min-h-[44px] px-5 rounded-xl bg-red-600 text-white text-sm font-semibold cursor-pointer"
          >
            Tentar novamente
          </button>
        </main>
      ) : (
        <main id="topo" className="flex-1 pb-24 md:pb-12">
          {/* TOP STORE HEADER WITH BURGER PHOTO BACKGROUND, LOGO & OPEN/CLOSED STATUS */}
          <section className="relative border-b border-white/10">
            <div className="relative h-44 sm:h-56 overflow-hidden bg-zinc-950">
              <SafeFoodImage
                src={settings.banner_image_url}
                alt={settings.store_name}
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0E] via-[#0B0B0E]/45 to-black/30" />
            </div>

            <div className="max-w-4xl mx-auto px-4 pb-6 -mt-12 sm:-mt-14 relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="flex items-end gap-4">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-4 border-[#0B0B0E] bg-black shrink-0 shadow-xl">
                    <SafeFoodImage
                      src={settings.logo_url}
                      alt={settings.store_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="pb-1">
                    <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white tracking-wide uppercase leading-none">
                      {settings.store_name}
                    </h1>
                    {settings.address && (
                      <p className="text-xs sm:text-sm text-zinc-300 mt-1.5 inline-flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" aria-hidden="true" />
                        <span>{settings.address}</span>
                      </p>
                    )}
                  </div>
                </div>

                {storeStatus && (
                  <div className="flex flex-col sm:items-end gap-1.5">
                    <div
                      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-semibold w-fit ${
                        storeStatus.isOpen
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-red-500/15 border-red-500/40 text-red-300'
                      }`}
                    >
                      <span>{storeStatus.statusText}</span>
                      <span aria-hidden="true" className="text-white/30">
                        ·
                      </span>
                      <span className="font-normal text-zinc-200">{storeStatus.detailText}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setHoursOpen((prev) => !prev)}
                      className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1 cursor-pointer w-fit"
                    >
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Ver horários</span>
                      {hoursOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {hoursOpen && settings.schedule && (
                <div className="mt-4 rounded-2xl bg-[#141418] border border-white/10 p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
                  {ORDERED_DAYS.map(({ key, label }) => {
                    const day = settings.schedule[key];
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between py-1 border-b border-white/5 last:border-b-0"
                      >
                        <span className="text-zinc-300">{label}</span>
                        <span className="font-mono text-zinc-100 tabular-nums">
                          {day?.enabled ? `${day.open} às ${day.close}` : 'Fechado'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* CARDÁPIO: PRODUTOS UM ABAIXO DO OUTRO */}
          <section id="cardapio" className="max-w-4xl mx-auto px-4 pt-6 sm:pt-8">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white uppercase tracking-wide">
                Cardápio
              </h2>
              <span className="text-xs text-zinc-400 tabular-nums">
                {products.length} {products.length === 1 ? 'item' : 'itens'}
              </span>
            </div>

            {products.length === 0 ? (
              <div className="rounded-2xl bg-[#141418] border border-white/10 p-8 text-center text-sm text-zinc-400">
                Nenhum produto disponível no momento.
              </div>
            ) : (
              <div className="flex flex-col gap-3.5">
                {products.map((product) => (
                  <article
                    key={product.id}
                    onClick={() => {
                      if (!product.available) return;
                      setEditingCartItem(null);
                      setActiveProduct(product);
                    }}
                    className={`rounded-2xl bg-[#141418] border border-white/10 p-3.5 sm:p-4 flex items-stretch gap-4 sm:gap-5 transition-colors ${
                      product.available
                        ? 'hover:border-red-500/60 hover:bg-[#19191F] cursor-pointer'
                        : 'opacity-60'
                    }`}
                  >
                    <div className="w-28 h-28 sm:w-40 sm:h-36 rounded-xl overflow-hidden bg-zinc-950 shrink-0 border border-white/5">
                      <SafeFoodImage
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                      <div>
                        {!product.available && (
                          <p className="text-xs text-amber-400 font-medium mb-0.5">
                            Indisponível no momento
                          </p>
                        )}
                        <h3 className="text-base sm:text-xl font-semibold text-white leading-snug">
                          {product.name}
                        </h3>
                        {product.description && (
                          <p className="text-xs sm:text-sm text-zinc-300 mt-1.5 leading-relaxed line-clamp-3">
                            {product.description}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                        <span className="font-mono text-base sm:text-lg font-bold text-white tabular-nums">
                          {formatCurrency(product.price)}
                        </span>

                        <button
                          type="button"
                          disabled={!product.available}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!product.available) return;
                            setEditingCartItem(null);
                            setActiveProduct(product);
                          }}
                          className={`min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                            product.available
                              ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
                              : 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
                          }`}
                        >
                          {product.available ? (
                            <>
                              <Plus className="w-4 h-4" />
                              <span>Adicionar</span>
                            </>
                          ) : (
                            <span>Indisponível</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
      )}

      {/* FOOTER DISCRETO */}
      <footer className="border-t border-white/10 bg-[#09090B] py-5 px-4 mb-14 md:mb-0">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
          <span>{settings?.store_name || 'Bulldog Hamburgueria'}</span>
          <button
            type="button"
            onClick={navigateToAdmin}
            className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Painel Administrativo</span>
          </button>
        </div>
      </footer>

      {/* TOAST FEEDBACK */}
      {cartToast && (
        <div className="fixed bottom-16 md:bottom-6 right-4 sm:right-6 z-40 rounded-xl bg-zinc-900 border border-red-500/40 px-4 py-3 text-sm text-white shadow-xl flex items-center gap-3">
          <span>{cartToast}</span>
          <button
            type="button"
            onClick={() => {
              setCartToast('');
              setCartOpen(true);
            }}
            className="text-xs font-semibold text-red-400 hover:text-red-300 cursor-pointer"
          >
            Ver carrinho
          </button>
        </div>
      )}

      {/* MOBILE STICKY CART BAR */}
      {totalCartItems > 0 && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#141418]/95 backdrop-blur-md border-t border-white/10 px-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-zinc-400 leading-none">
              {totalCartItems} {totalCartItems === 1 ? 'item' : 'itens'}
            </p>
            <p className="font-mono text-base font-bold text-white tabular-nums mt-0.5 leading-none">
              {formatCurrency(cartSubtotal)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="min-h-[40px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Ver carrinho</span>
          </button>
        </div>
      )}

      {/* MODALS & DRAWERS */}
      <ProductModal
        product={activeProduct}
        editingCartItem={editingCartItem}
        onClose={() => {
          setActiveProduct(null);
          setEditingCartItem(null);
        }}
        onConfirm={handleConfirmProduct}
      />

      <CartDrawer
        open={cartOpen}
        items={cart}
        deliveryFee={settings?.delivery_fee || 0}
        onClose={() => setCartOpen(false)}
        onUpdateQuantity={handleUpdateQuantity}
        onEditItem={handleEditCartItem}
        onRemoveItem={handleRemoveItem}
        onCheckout={() => {
          setCartOpen(false);
          setCheckoutOpen(true);
        }}
      />

      {settings && (
        <CheckoutModal
          open={checkoutOpen}
          items={cart}
          settings={settings}
          onClose={() => setCheckoutOpen(false)}
          onClearCart={() => setCart([])}
        />
      )}
    </div>
  );
}
