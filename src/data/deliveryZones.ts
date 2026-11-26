export interface DeliveryTier {
  fee: number;
  label: string;
  neighborhoods: string[];
}

export const OTHER_NEIGHBORHOOD_VALUE = 'Outro bairro (taxa a confirmar)';

export const DELIVERY_TIERS: DeliveryTier[] = [
  {
    fee: 5,
    label: 'Taxa de R$ 5,00',
    neighborhoods: [
      'Cabral',
      'Campinas',
      'Campo Santo Antônio',
      'Centro',
      'Córrego da Ilha',
      'Esplanada',
      'Fidalgo',
      'Francisco de Moura',
      'Gaia',
      'Mangabeiras',
      'Mangueiras',
      'Morada da Serra',
      'Morro da Cruz',
      'Nossa Senhora do Ó',
      'Siderúrgica',
      'Terra Santa',
      'Vila Esperança',
      'Vila Michel',
      'Vila Santa Cruz',
    ],
  },
  {
    fee: 6,
    label: 'Taxa de R$ 6,00',
    neighborhoods: [
      'Adelmolândia 1',
      'Adelmolândia 2',
      'Caieiras',
      'Catita',
      'Fogo Apagou',
      'Galego',
      'Paciência',
      'São Francisco',
      'Vila Real',
    ],
  },
  {
    fee: 8,
    label: 'Taxa de R$ 8,00',
    neighborhoods: [
      'Pompeu',
      'Roça Grande',
      'Rosário 1',
      'Rosário 2',
      'Rosário 3',
    ],
  },
];

const NEIGHBORHOOD_FEE_MAP = new Map<string, number>();
for (const tier of DELIVERY_TIERS) {
  for (const name of tier.neighborhoods) {
    NEIGHBORHOOD_FEE_MAP.set(name.toLowerCase(), tier.fee);
  }
}

export function getDeliveryFeeForNeighborhood(neighborhood: string): number | null {
  const normalized = neighborhood.trim().toLowerCase();
  if (!normalized || normalized === OTHER_NEIGHBORHOOD_VALUE.toLowerCase()) {
    return null;
  }
  const exact = NEIGHBORHOOD_FEE_MAP.get(normalized);
  return exact !== undefined ? exact : null;
}
