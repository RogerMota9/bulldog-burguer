import type { CartItem, CheckoutFormData, DayKey, StoreSettings } from '../types';

export const ORDERED_DAYS: { key: DayKey; label: string }[] = [
  { key: 'seg', label: 'Segunda-feira' },
  { key: 'ter', label: 'Terça-feira' },
  { key: 'qua', label: 'Quarta-feira' },
  { key: 'qui', label: 'Quinta-feira' },
  { key: 'sex', label: 'Sexta-feira' },
  { key: 'sab', label: 'Sábado' },
  { key: 'dom', label: 'Domingo' },
];

function parseHHMM(value: string): number {
  const [h, m] = value.split(':').map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function getStoreOpenStatus(settings: StoreSettings): {
  isOpen: boolean;
  statusText: string;
  detailText: string;
} {
  if (settings.store_status_mode === 'open') {
    return {
      isOpen: true,
      statusText: 'Aberta agora',
      detailText: settings.opening_hours || 'Recebendo pedidos pelo WhatsApp',
    };
  }
  if (settings.store_status_mode === 'closed') {
    return {
      isOpen: false,
      statusText: 'Fechada no momento',
      detailText: settings.opening_hours || 'Confira nossos horários de funcionamento',
    };
  }

  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekdayMap: Record<string, DayKey> = {
    Sun: 'dom',
    Mon: 'seg',
    Tue: 'ter',
    Wed: 'qua',
    Thu: 'qui',
    Fri: 'sex',
    Sat: 'sab',
  };

  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
  const hourNum = Number(parts.find((p) => p.type === 'hour')?.value || '0') % 24;
  const minNum = Number(parts.find((p) => p.type === 'minute')?.value || '0');
  const currentMins = hourNum * 60 + minNum;

  const dayKey = weekdayMap[weekdayStr] || 'seg';
  const todaySchedule = settings.schedule?.[dayKey];

  const dayOrder: DayKey[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const prevDayKey = dayOrder[(dayOrder.indexOf(dayKey) + 6) % 7];
  const prevSchedule = settings.schedule?.[prevDayKey];

  // Check overnight shift from yesterday
  if (prevSchedule?.enabled) {
    const prevOpen = parseHHMM(prevSchedule.open);
    const prevClose = parseHHMM(prevSchedule.close);
    if (prevClose <= prevOpen && currentMins < prevClose) {
      return {
        isOpen: true,
        statusText: 'Aberta agora',
        detailText: `Fecha às ${prevSchedule.close}`,
      };
    }
  }

  if (todaySchedule?.enabled) {
    const openMins = parseHHMM(todaySchedule.open);
    const closeMins = parseHHMM(todaySchedule.close);
    const isWithinToday =
      closeMins > openMins
        ? currentMins >= openMins && currentMins < closeMins
        : currentMins >= openMins;

    if (isWithinToday) {
      return {
        isOpen: true,
        statusText: 'Aberta agora',
        detailText: `Hoje até ${todaySchedule.close}`,
      };
    }

    if (currentMins < openMins) {
      return {
        isOpen: false,
        statusText: 'Fechada no momento',
        detailText: `Abre hoje às ${todaySchedule.open}`,
      };
    }
  }

  return {
    isOpen: false,
    statusText: 'Fechada no momento',
    detailText: settings.opening_hours || 'Confira os horários de funcionamento',
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(value) ? value : 0);
}

export function isSafeMediaUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function getCartItemUnitTotal(item: CartItem): number {
  const addonsSum = item.addons.reduce((acc, a) => acc + a.price, 0);
  return item.basePrice + addonsSum;
}

export function getCartSubtotal(items: CartItem[]): number {
  return items.reduce((acc, item) => acc + getCartItemUnitTotal(item) * item.quantity, 0);
}

export function buildWhatsAppOrderMessage(
  items: CartItem[],
  form: CheckoutFormData,
  deliveryFee: number,
  storeName: string,
): string {
  const subtotal = getCartSubtotal(items);
  const appliedDeliveryFee = form.deliveryType === 'entrega' ? deliveryFee : 0;
  const total = subtotal + appliedDeliveryFee;

  const lines: string[] = [];
  lines.push(`NOVO PEDIDO — ${storeName.toUpperCase().includes('BULLDOG') ? 'BULLDOG' : storeName.toUpperCase()}`);
  lines.push('');
  lines.push(`Cliente: ${form.customerName.trim()}`);
  lines.push(`Telefone: ${form.customerPhone.trim()}`);
  lines.push('');
  lines.push('TIPO DE PEDIDO:');
  lines.push(form.deliveryType === 'entrega' ? 'Entrega.' : 'Retirada no estabelecimento.');

  if (form.deliveryType === 'entrega') {
    lines.push('');
    lines.push('ENDEREÇO:');
    const addrParts = [form.streetAddress.trim(), form.neighborhood.trim()].filter(Boolean);
    lines.push(addrParts.join(' — '));
    if (form.referencePoint.trim()) {
      lines.push(`Ponto de referência: ${form.referencePoint.trim()}`);
    }
  }

  lines.push('');
  lines.push('PRODUTOS:');

  for (const item of items) {
    lines.push('');
    const itemLineTotal = getCartItemUnitTotal(item) * item.quantity;
    lines.push(`${item.quantity}x ${item.name} — ${formatCurrency(itemLineTotal)}`);
    for (const addon of item.addons) {
      lines.push(`- Adicional de ${addon.name} — ${formatCurrency(addon.price)}`);
    }
    if (item.notes.trim()) {
      lines.push(`Observação: ${item.notes.trim()}`);
    }
  }

  lines.push('');
  lines.push('PAGAMENTO:');
  lines.push(`${form.paymentMethod}.`);

  const isCash = form.paymentMethod.toLowerCase().includes('dinheiro');
  if (isCash) {
    lines.push('');
    lines.push('TROCO:');
    if (form.needsChange && form.changeFor.trim()) {
      lines.push(`Troco para ${form.changeFor.trim()}.`);
    } else {
      lines.push('Não precisa.');
    }
  }

  if (form.generalNotes.trim()) {
    lines.push('');
    lines.push('OBSERVAÇÕES:');
    lines.push(form.generalNotes.trim());
  }

  if (appliedDeliveryFee > 0) {
    lines.push('');
    lines.push(`Taxa de entrega: ${formatCurrency(appliedDeliveryFee)}`);
  }

  lines.push('');
  lines.push('-------------------------');
  lines.push(`TOTAL DO PEDIDO: ${formatCurrency(total)}`);

  return lines.join('\n');
}

export function buildWhatsAppUrl(rawPhone: string, message: string): string {
  let digits = rawPhone.replace(/\D/g, '');
  if (!digits) {
    digits = '31973391048';
  }
  if (!digits.startsWith('55') && digits.length <= 11) {
    digits = `55${digits}`;
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
