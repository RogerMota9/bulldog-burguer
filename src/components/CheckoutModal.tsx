import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Clock, Copy, ExternalLink, MapPin, Store, X } from 'lucide-react';
import {
  DELIVERY_TIERS,
  getDeliveryFeeForNeighborhood,
  OTHER_NEIGHBORHOOD_VALUE,
} from '../data/deliveryZones';
import type { CartItem, CheckoutFormData, StoreSettings } from '../types';
import {
  buildWhatsAppOrderMessage,
  buildWhatsAppUrl,
  formatCurrency,
  getCartItemUnitTotal,
  getCartSubtotal,
} from '../utils/format';

interface CheckoutModalProps {
  open: boolean;
  items: CartItem[];
  settings: StoreSettings;
  onClose: () => void;
  onClearCart: () => void;
}

export function CheckoutModal({ open, items, settings, onClose, onClearCart }: CheckoutModalProps) {
  const [step, setStep] = useState<'form' | 'summary'>('form');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [orderSent, setOrderSent] = useState(false);

  const [form, setForm] = useState<CheckoutFormData>({
    customerName: '',
    customerPhone: '',
    deliveryType: 'entrega',
    streetAddress: '',
    neighborhood: '',
    referencePoint: '',
    paymentMethod: settings.payment_methods[0] || 'Pix',
    needsChange: false,
    changeFor: '',
    generalNotes: '',
  });

  useEffect(() => {
    if (open) {
      setStep('form');
      setError('');
      setCopied(false);
      setOrderSent(false);
      setForm((prev) => ({
        ...prev,
        paymentMethod: settings.payment_methods.includes(prev.paymentMethod)
          ? prev.paymentMethod
          : settings.payment_methods[0] || 'Pix',
      }));
    }
  }, [open, settings.payment_methods]);

  if (!open) return null;

  const MIN_ORDER_VALUE = 20;
  const subtotal = getCartSubtotal(items);
  const missingForMinOrder = Math.max(0, MIN_ORDER_VALUE - subtotal);
  const belowMinOrder = missingForMinOrder > 0;
  const neighborhoodFee = getDeliveryFeeForNeighborhood(form.neighborhood);
  const deliveryFee: number | null =
    form.deliveryType === 'retirada'
      ? 0
      : form.neighborhood === OTHER_NEIGHBORHOOD_VALUE
        ? null
        : neighborhoodFee !== null
          ? neighborhoodFee
          : settings.delivery_fee > 0
            ? settings.delivery_fee
            : null;
  const grandTotal = subtotal + (deliveryFee ?? 0);
  const isCash = form.paymentMethod.toLowerCase().includes('dinheiro');

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (belowMinOrder) {
      setError(
        `O pedido mínimo é de ${formatCurrency(MIN_ORDER_VALUE)}. Faltam ${formatCurrency(missingForMinOrder)} em itens para finalizar.`,
      );
      return;
    }
    if (!form.customerName.trim()) {
      setError('Informe seu nome completo.');
      return;
    }
    if (form.customerPhone.replace(/\D/g, '').length < 8) {
      setError('Informe um número de telefone válido para contato.');
      return;
    }
    if (form.deliveryType === 'entrega') {
      if (!form.streetAddress.trim() || !form.neighborhood.trim()) {
        setError('Informe o endereço completo e o bairro para entrega.');
        return;
      }
    }
    if (isCash && form.needsChange && !form.changeFor.trim()) {
      setError('Informe para qual valor você precisa de troco.');
      return;
    }

    setOrderSent(false);
    setStep('summary');
  };

  const orderMessage = buildWhatsAppOrderMessage(
    items,
    form,
    deliveryFee,
    settings.store_name,
  );
  const whatsappUrl = buildWhatsAppUrl(settings.whatsapp_number, orderMessage);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(orderMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Finalização do pedido"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[94vh] flex flex-col bg-[#141418] border border-white/10 rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 sm:px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {step === 'summary' && (
              <button
                type="button"
                onClick={() => setStep('form')}
                aria-label="Voltar para edição dos dados"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-zinc-900 text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h2 className="font-display text-2xl font-bold text-white leading-none">
                {step === 'form' ? 'Finalizar Pedido' : 'Resumo do Pedido'}
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                {step === 'form'
                  ? 'Passo 1 de 2 · Preencha seus dados e forma de pagamento'
                  : 'Passo 2 de 2 · Confira tudo antes de enviar no WhatsApp'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar finalização"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-300 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'form' ? (
          <form onSubmit={handleReview} className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
            {error && (
              <div className="rounded-xl bg-red-500/15 border border-red-500/40 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="checkout-name" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Nome completo *
                </label>
                <input
                  id="checkout-name"
                  type="text"
                  required
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  placeholder="Seu nome completo"
                  className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label htmlFor="checkout-phone" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Telefone / WhatsApp *
                </label>
                <input
                  id="checkout-phone"
                  type="tel"
                  required
                  value={form.customerPhone}
                  onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                  placeholder="(31) 99999-9999"
                  className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-zinc-300 mb-2">
                Tipo de pedido *
              </span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, deliveryType: 'entrega' })}
                  className={`min-h-[48px] px-4 py-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold transition-colors cursor-pointer ${
                    form.deliveryType === 'entrega'
                      ? 'bg-red-600/20 border-red-500 text-white'
                      : 'bg-zinc-900 border-white/10 text-zinc-300 hover:border-white/25'
                  }`}
                >
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span>Entrega</span>
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, deliveryType: 'retirada' })}
                  className={`min-h-[48px] px-4 py-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold transition-colors cursor-pointer ${
                    form.deliveryType === 'retirada'
                      ? 'bg-red-600/20 border-red-500 text-white'
                      : 'bg-zinc-900 border-white/10 text-zinc-300 hover:border-white/25'
                  }`}
                >
                  <Store className="w-4 h-4 shrink-0" />
                  <span>Retirada no local</span>
                </button>
              </div>
            </div>

            {form.deliveryType === 'entrega' && (
              <div className="space-y-4 rounded-2xl bg-zinc-900/60 border border-white/10 p-4">
                <div>
                  <label htmlFor="checkout-address" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Endereço completo (Rua e Número) *
                  </label>
                  <input
                    id="checkout-address"
                    type="text"
                    required
                    value={form.streetAddress}
                    onChange={(e) => setForm({ ...form, streetAddress: e.target.value })}
                    placeholder="Ex: Rua das Flores, 245, Apto 102"
                    className="w-full min-h-[44px] rounded-xl bg-zinc-950 border border-white/10 px-3.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="checkout-neighborhood" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Bairro *
                    </label>
                    <select
                      id="checkout-neighborhood"
                      required
                      value={form.neighborhood}
                      onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                      className="w-full min-h-[44px] rounded-xl bg-zinc-950 border border-white/10 px-3 text-sm text-white focus:outline-none focus:border-red-500 cursor-pointer"
                    >
                      <option value="">Selecione seu bairro...</option>
                      {DELIVERY_TIERS.map((tier) => (
                        <optgroup key={tier.fee} label={tier.label}>
                          {tier.neighborhoods.map((name) => (
                            <option key={name} value={name}>
                              {name} — {formatCurrency(tier.fee)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      <optgroup label="Outras regiões">
                        <option value={OTHER_NEIGHBORHOOD_VALUE}>{OTHER_NEIGHBORHOOD_VALUE}</option>
                      </optgroup>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="checkout-reference" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Ponto de referência
                    </label>
                    <input
                      id="checkout-reference"
                      type="text"
                      value={form.referencePoint}
                      onChange={(e) => setForm({ ...form, referencePoint: e.target.value })}
                      placeholder="Opcional"
                      className="w-full min-h-[44px] rounded-xl bg-zinc-950 border border-white/10 px-3.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-950/70 border border-white/5 px-3.5 py-2.5 text-xs">
                  {form.neighborhood ? (
                    <>
                      <span className="text-zinc-300">
                        Taxa de entrega ({form.neighborhood})
                      </span>
                      <span className="font-mono font-semibold text-amber-300 tabular-nums">
                        {deliveryFee !== null ? formatCurrency(deliveryFee) : 'A confirmar'}
                      </span>
                    </>
                  ) : (
                    <span className="text-zinc-400">
                      Taxas de entrega: R$ 5,00 · R$ 6,00 · R$ 8,00 conforme o bairro selecionado.
                    </span>
                  )}
                </div>
              </div>
            )}

            <div>
              <span className="block text-xs font-semibold text-zinc-300 mb-2">
                Forma de pagamento *
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                {settings.payment_methods.map((method) => {
                  const selected = form.paymentMethod === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setForm({ ...form, paymentMethod: method })}
                      className={`min-h-[44px] px-3.5 py-2.5 rounded-xl border text-sm font-medium text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        selected
                          ? 'bg-red-600/20 border-red-500 text-white'
                          : 'bg-zinc-900 border-white/10 text-zinc-300 hover:border-white/25'
                      }`}
                    >
                      <span className="truncate">{method}</span>
                      {selected && <Check className="w-4 h-4 text-red-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {isCash && (
              <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-4 space-y-3">
                <span className="block text-xs font-semibold text-zinc-300">
                  Precisa de troco?
                </span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, needsChange: false, changeFor: '' })}
                    className={`min-h-[42px] px-4 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                      !form.needsChange
                        ? 'bg-red-600/20 border-red-500 text-white'
                        : 'bg-zinc-950 border-white/10 text-zinc-300'
                    }`}
                  >
                    Não precisa
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, needsChange: true })}
                    className={`min-h-[42px] px-4 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                      form.needsChange
                        ? 'bg-red-600/20 border-red-500 text-white'
                        : 'bg-zinc-950 border-white/10 text-zinc-300'
                    }`}
                  >
                    Sim, preciso de troco
                  </button>
                </div>

                {form.needsChange && (
                  <div>
                    <label htmlFor="checkout-change" className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Troco para qual valor? *
                    </label>
                    <input
                      id="checkout-change"
                      type="text"
                      value={form.changeFor}
                      onChange={(e) => setForm({ ...form, changeFor: e.target.value })}
                      placeholder="Ex: R$ 50,00 ou R$ 100,00"
                      className="w-full min-h-[44px] rounded-xl bg-zinc-950 border border-white/10 px-3.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <label htmlFor="checkout-notes" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Observações gerais do pedido
              </label>
              <textarea
                id="checkout-notes"
                rows={2}
                value={form.generalNotes}
                onChange={(e) => setForm({ ...form, generalNotes: e.target.value })}
                placeholder="Ex: Tocar interfone 12, enviar sachês de ketchup..."
                className="w-full rounded-xl bg-zinc-900 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div
              className={`rounded-xl border px-3.5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 ${
                belowMinOrder
                  ? 'bg-amber-500/10 border-amber-500/35 text-amber-200'
                  : 'bg-zinc-900/70 border-white/10 text-zinc-300'
              }`}
            >
              <span className="font-semibold">
                Pedido mínimo: {formatCurrency(MIN_ORDER_VALUE)}
              </span>
              {belowMinOrder && (
                <span className="text-amber-300">
                  Faltam {formatCurrency(missingForMinOrder)} em itens para finalizar
                </span>
              )}
            </div>

            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-zinc-400">
                  {form.deliveryType === 'entrega'
                    ? deliveryFee !== null
                      ? `Total com entrega (${formatCurrency(deliveryFee)})`
                      : 'Subtotal dos itens (+ taxa do bairro)'
                    : 'Total do pedido'}
                </p>
                <p className="font-mono text-xl font-bold text-white tabular-nums">
                  {formatCurrency(grandTotal)}
                </p>
              </div>
              <button
                type="submit"
                className="min-h-[48px] px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Conferir resumo
              </button>
            </div>
          </form>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
            <div className="rounded-2xl bg-zinc-900/80 border border-white/10 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
                <div>
                  <p className="text-xs text-zinc-400">Cliente</p>
                  <p className="text-sm font-semibold text-white">
                    {form.customerName} · {form.customerPhone}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-400">Modalidade</p>
                  <p className="text-sm font-semibold text-white">
                    {form.deliveryType === 'entrega' ? 'Entrega' : 'Retirada no local'}
                  </p>
                </div>
              </div>

              {form.deliveryType === 'entrega' && (
                <div className="text-xs text-zinc-300 pb-3 border-b border-white/10">
                  <span className="text-zinc-400 block mb-0.5">Endereço de entrega</span>
                  <span>
                    {form.streetAddress} — {form.neighborhood}
                  </span>
                  {form.referencePoint && (
                    <span className="block text-zinc-400 mt-0.5">
                      Referência: {form.referencePoint}
                    </span>
                  )}
                </div>
              )}

              <div className="space-y-2.5">
                {items.map((item) => {
                  const lineTotal = getCartItemUnitTotal(item) * item.quantity;
                  return (
                    <div key={item.cartItemId} className="text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-medium text-white">
                          {item.quantity}x {item.name}
                        </span>
                        <span className="font-mono text-white tabular-nums shrink-0">
                          {formatCurrency(lineTotal)}
                        </span>
                      </div>
                      {item.addons.map((addon) => (
                        <p key={addon.id} className="text-xs text-zinc-400 pl-4">
                          + {addon.name} ({formatCurrency(addon.price)})
                        </p>
                      ))}
                      {item.notes && (
                        <p className="text-xs text-amber-300/90 pl-4">Obs: {item.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-white/10 space-y-1 text-sm">
                <div className="flex justify-between text-zinc-300">
                  <span>Pagamento</span>
                  <span>
                    {form.paymentMethod}
                    {isCash
                      ? form.needsChange
                        ? ` (Troco para ${form.changeFor})`
                        : ' (Sem troco)'
                      : ''}
                  </span>
                </div>
                {form.deliveryType === 'entrega' && (
                  <div className="flex justify-between text-zinc-300">
                    <span>Taxa de entrega</span>
                    <span className="font-mono tabular-nums">
                      {deliveryFee !== null ? formatCurrency(deliveryFee) : 'A confirmar'}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-white pt-1.5 border-t border-white/10">
                  <span>{deliveryFee === null && form.deliveryType === 'entrega' ? 'Subtotal dos itens' : 'Total do pedido'}</span>
                  <span className="font-mono tabular-nums text-red-400">
                    {formatCurrency(grandTotal)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-zinc-400">
                  Pré-visualização da mensagem para o WhatsApp
                </span>
                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="text-xs font-medium text-zinc-300 hover:text-white inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar texto</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="rounded-xl bg-zinc-950 border border-white/10 p-3.5 text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
                {orderMessage}
              </pre>
            </div>

            <div
              className={`rounded-xl border px-4 py-3 text-xs leading-relaxed flex items-start gap-2.5 ${
                orderSent
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-100'
              }`}
            >
              <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" aria-hidden="true" />
              <div>
                <p className="font-semibold text-white">
                  {orderSent
                    ? 'Pedido enviado para o WhatsApp! Aguarde a confirmação do pedido.'
                    : 'Aguarde a confirmação do pedido.'}
                </p>
                <p className="mt-0.5 text-zinc-300">
                  Ao clicar no botão abaixo, o WhatsApp será aberto com seu pedido preenchido. Envie a mensagem e aguarde a confirmação do nosso atendimento.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOrderSent(true)}
                className="flex-1 min-h-[50px] px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <span>Enviar pedido pelo WhatsApp</span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => {
                  onClearCart();
                  onClose();
                }}
                className="min-h-[50px] px-4 py-3 rounded-xl border border-white/15 text-zinc-300 hover:bg-white/5 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                Limpar carrinho e fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
