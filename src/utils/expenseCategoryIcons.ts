import {
  BedDouble,
  Bus,
  Camera,
  Car,
  CircleDollarSign,
  Cross,
  FileText,
  Fuel,
  HeartPulse,
  Landmark,
  Map as MapIcon,
  Plane,
  ShieldCheck,
  ShoppingBag,
  Utensils,
  WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CategoryMeta } from '../types';

export type ExpenseCategoryIconOption = {
  id: string;
  label: string;
  Icon: LucideIcon;
};

export const expenseCategoryIconOptions: ExpenseCategoryIconOption[] = [
  { id: 'utensils', label: 'Alimentacao', Icon: Utensils },
  { id: 'fuel', label: 'Combustivel', Icon: Fuel },
  { id: 'cross', label: 'Saude', Icon: Cross },
  { id: 'heart-pulse', label: 'Hospital', Icon: HeartPulse },
  { id: 'bed', label: 'Hospedagem', Icon: BedDouble },
  { id: 'bus', label: 'Onibus', Icon: Bus },
  { id: 'car', label: 'Carro', Icon: Car },
  { id: 'plane', label: 'Aviao', Icon: Plane },
  { id: 'file-text', label: 'Documentos', Icon: FileText },
  { id: 'shield', label: 'Seguro', Icon: ShieldCheck },
  { id: 'shopping-bag', label: 'Compras', Icon: ShoppingBag },
  { id: 'camera', label: 'Passeios', Icon: Camera },
  { id: 'landmark', label: 'Monumento', Icon: Landmark },
  { id: 'map', label: 'Mapa', Icon: MapIcon },
  { id: 'wallet', label: 'Carteira', Icon: WalletCards },
  { id: 'money', label: 'Dinheiro', Icon: CircleDollarSign },
];

const iconMap = new Map(expenseCategoryIconOptions.map((option) => [option.id, option.Icon]));

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const inferExpenseCategoryIconId = (category: Pick<CategoryMeta, 'id' | 'name' | 'icon'>) => {
  if (category.icon && iconMap.has(category.icon)) return category.icon;

  const text = normalizeText(`${category.id} ${category.name}`);

  if (text.includes('aliment') || text.includes('comida') || text.includes('restaurante')) return 'utensils';
  if (text.includes('combust') || text.includes('gasolina') || text.includes('fuel')) return 'fuel';
  if (text.includes('hospital') || text.includes('saude') || text.includes('medic')) return 'heart-pulse';
  if (text.includes('hosped') || text.includes('hotel') || text.includes('lodging')) return 'bed';
  if (text.includes('transporte') || text.includes('transport') || text.includes('onibus') || text.includes('bus')) return 'bus';
  if (text.includes('carro') || text.includes('uber') || text.includes('taxi')) return 'car';
  if (text.includes('voo') || text.includes('aviao') || text.includes('flight')) return 'plane';
  if (text.includes('document')) return 'file-text';
  if (text.includes('seguro')) return 'shield';
  if (text.includes('compr') || text.includes('shopping')) return 'shopping-bag';
  if (text.includes('passeio') || text.includes('tour') || text.includes('atracao')) return 'camera';
  if (text.includes('museu') || text.includes('monumento')) return 'landmark';

  return 'wallet';
};

export const getExpenseCategoryIcon = (category: Pick<CategoryMeta, 'id' | 'name' | 'icon'>): LucideIcon =>
  iconMap.get(inferExpenseCategoryIconId(category)) ?? WalletCards;
