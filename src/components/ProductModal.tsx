import { useEffect, useState } from 'react';
import { Check, Minus, Plus, X } from 'lucide-react';
import type { Addon, CartItem, Product } from '../types';
import { formatCurrency } from '../utils/format';
import { SafeFoodImage } from './BulldogLogo';

interface ProductModalProps {
  product: Product | null;
  editingCartItem?: CartItem | null;
  onClose: () => void;
  onConfirm: (item: CartItem) => void;
}

export function ProductModal({ product, editingCartItem, onClose, onConfirm }: ProductModalProps) {
  const [selectedAddonIds, setSelectedAddonIds] = useState<number[]>([]);
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!product) return;
    if (editingCartItem) {
      setSelectedAddonIds(editingCartItem.addons.map((a) => a.id));
      setNotes(editingCartItem.notes);
      setQuantity(editingCartItem.quantity);
    } else {
      setSelectedAddonIds([]);
      setNotes('');
      setQuantity(1);
    }
  }, [product, editingCartItem]);

  useEffect(() => {
    if (!product) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [product, onClose]);

  if (!product) return null;

  const toggleAddon = (addonId: number) => {
    setSelectedAddonIds((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId],
    );
  };

  const selectedAddons: Addon[] = product.addons.filter((a) => selectedAddonIds.includes(a.id));
  const addonsSum = selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const unitTotal = product.price + addonsSum;
  const total = unitTotal * quantity;

  const handleConfirm = () => {
    const cartItemId =
      editingCartItem?.cartItemId ||
      `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    onConfirm({
      cartItemId,
      productId: product.id,
      name: product.name,
      image_url: product.image_url,
      basePrice: product.price,
      quantity,
      addons: selectedAddons.map((a) => ({ id: a.id, name: a.name, price: a.price })),
      notes: notes.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl max-h-[92vh] flex flex-col bg-[#141418] border border-white/10 rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-56 sm:h-64 shrink-0 bg-zinc-950">
          <SafeFoodImage
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#141418] via-black/25 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes do produto"
            className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 pb-6 space-y-5">
          <div>
            {product.category_name && (
              <p className="text-xs font-medium text-red-400 tracking-wide">
                {product.category_name}
                {product.is_demo ? ' · Item demonstrativo' : ''}
              </p>
            )}
            <h2
              id="product-modal-title"
              className="font-display text-2xl sm:text-3xl font-bold text-white mt-1 leading-tight"
            >
              {product.name}
            </h2>
            {product.description && (
              <p className="text-sm text-zinc-300 mt-2 leading-relaxed">{product.description}</p>
            )}
            <p className="font-mono text-lg font-semibold text-white tabular-nums mt-2">
              {formatCurrency(product.price)}
            </p>
          </div>

          {product.addons.length > 0 && (
            <div className="border-t border-white/10 pt-4">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Adicionais</h3>
                <span className="text-xs text-zinc-400">Opcional · escolha quantos quiser</span>
              </div>
              <div className="space-y-2">
                {product.addons.map((addon) => {
                  const checked = selectedAddonIds.includes(addon.id);
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      onClick={() => toggleAddon(addon.id)}
                      className={`w-full min-h-[48px] px-4 py-2.5 rounded-xl border flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                        checked
                          ? 'bg-red-600/15 border-red-500/60 text-white'
                          : 'bg-zinc-900/70 border-white/10 text-zinc-200 hover:border-white/25'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition-colors ${
                            checked
                              ? 'bg-red-600 border-red-500 text-white'
                              : 'border-zinc-600 bg-zinc-950'
                          }`}
                        >
                          {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                        </span>
                        <span className="text-sm font-medium">{addon.name}</span>
                      </span>
                      <span className="font-mono text-sm text-red-400 tabular-nums shrink-0">
                        + {formatCurrency(addon.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t border-white/10 pt-4">
            <label htmlFor="item-notes" className="block text-sm font-semibold text-white mb-2">
              Observações do item
            </label>
            <textarea
              id="item-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={240}
              placeholder="Ex: Sem cebola, ponto da carne bem passado, maionese à parte..."
              className="w-full rounded-xl bg-zinc-900/90 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[#111115] px-5 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center bg-zinc-900 border border-white/10 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Diminuir quantidade"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-9 text-center font-mono text-sm font-semibold text-white tabular-nums">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              aria-label="Aumentar quantidade"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm flex items-center justify-between gap-3 transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>{editingCartItem ? 'Salvar alterações' : 'Adicionar ao pedido'}</span>
            <span className="font-mono tabular-nums">{formatCurrency(total)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
