import { Minus, Pencil, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import type { CartItem } from '../types';
import { formatCurrency, getCartItemUnitTotal, getCartSubtotal } from '../utils/format';
import { SafeFoodImage } from './BulldogLogo';

interface CartDrawerProps {
  open: boolean;
  items: CartItem[];
  deliveryFee: number;
  onClose: () => void;
  onUpdateQuantity: (cartItemId: string, delta: number) => void;
  onEditItem: (item: CartItem) => void;
  onRemoveItem: (cartItemId: string) => void;
  onCheckout: () => void;
}

export function CartDrawer({
  open,
  items,
  deliveryFee,
  onClose,
  onUpdateQuantity,
  onEditItem,
  onRemoveItem,
  onCheckout,
}: CartDrawerProps) {
  if (!open) return null;

  const subtotal = getCartSubtotal(items);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Carrinho de compras"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg h-full bg-[#121216] border-l border-white/10 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-red-500" aria-hidden="true" />
            <h2 className="font-display text-2xl font-bold text-white tracking-wide">
              Seu Pedido ({totalQuantity})
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar carrinho"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-300 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4">
              <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center mb-4">
                <ShoppingBag className="w-7 h-7 text-zinc-500" />
              </div>
              <p className="text-base font-semibold text-white">Seu carrinho está vazio</p>
              <p className="text-sm text-zinc-400 mt-1 max-w-xs">
                Explore os hambúrgueres, hot dogs e acompanhamentos no cardápio para montar seu pedido.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                Explorar cardápio
              </button>
            </div>
          ) : (
            items.map((item) => {
              const unitTotal = getCartItemUnitTotal(item);
              const lineTotal = unitTotal * item.quantity;

              return (
                <div
                  key={item.cartItemId}
                  className="rounded-2xl bg-[#19191F] border border-white/10 p-4 space-y-3"
                >
                  <div className="flex items-start gap-3.5">
                    <SafeFoodImage
                      src={item.image_url}
                      alt={item.name}
                      className="w-20 h-20 rounded-xl object-cover shrink-0 border border-white/5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-white leading-snug">
                          {item.name}
                        </h3>
                        <span className="font-mono text-sm font-semibold text-white tabular-nums shrink-0">
                          {formatCurrency(lineTotal)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 font-mono tabular-nums mt-0.5">
                        Unitário: {formatCurrency(unitTotal)}
                      </p>

                      {item.addons.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-xs text-zinc-300">
                          {item.addons.map((addon) => (
                            <li key={addon.id}>
                              + {addon.name} ({formatCurrency(addon.price)})
                            </li>
                          ))}
                        </ul>
                      )}

                      {item.notes && (
                        <p className="mt-2 text-xs text-amber-300/90 break-words">
                          Obs: {item.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEditItem(item)}
                        className="min-h-[38px] px-2.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.cartItemId)}
                        className="min-h-[38px] px-2.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remover
                      </button>
                    </div>

                    <div className="flex items-center bg-zinc-900 border border-white/10 rounded-xl p-0.5">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.cartItemId, -1)}
                        aria-label={`Diminuir quantidade de ${item.name}`}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center font-mono text-sm font-semibold text-white tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.cartItemId, 1)}
                        aria-label={`Aumentar quantidade de ${item.name}`}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-white/10 bg-[#0E0E12] px-5 py-4 space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between text-zinc-300">
                <span>Subtotal dos itens</span>
                <span className="font-mono tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              {deliveryFee > 0 && (
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Taxa de entrega (se optar por entrega)</span>
                  <span className="font-mono tabular-nums">{formatCurrency(deliveryFee)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-base font-bold text-white pt-1.5 border-t border-white/10">
                <span>Total estimado</span>
                <span className="font-mono tabular-nums text-red-400">
                  {formatCurrency(subtotal)}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="sm:w-2/5 min-h-[48px] px-4 py-3 rounded-xl border border-white/15 text-zinc-200 hover:bg-white/5 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                Continuar comprando
              </button>
              <button
                type="button"
                onClick={onCheckout}
                className="sm:w-3/5 min-h-[48px] px-5 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Finalizar pedido
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
