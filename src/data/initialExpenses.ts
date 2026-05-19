import type { CategoryMeta, Expense } from '../types';

export const STORAGE_KEY = 'europa-budget-expenses-v1';

export const categories: CategoryMeta[] = [
  { id: 'lodging', name: 'Hospedagens', label: 'Cidade e datas', accent: '#0f766e' },
  { id: 'transport', name: 'Transportes', label: 'Trecho', accent: '#2563eb' },
  { id: 'tours', name: 'Passeios', label: 'Passeio', accent: '#db2777' },
  { id: 'Alimentação', name: 'Alimentação', label: 'Gasto', accent: '#7c3aed' },
  { id: 'Comprinhas', name: 'Comprinhas', label: 'Gasto', accent: '#ea580c' },
  { id: 'Outros', name: 'Outros', label: 'Gasto', accent: '#475569' },
];

export const categoryNames: Record<string, string> = {
  lodging: 'Hospedagens',
  transport: 'Transportes',
  tours: 'Passeios',
  Alimentação: 'Alimentação',
  Comprinhas: 'Comprinhas',
  Outros: 'Outros',
};

export const initialExpenses: Expense[] = [
  { id: 'lodging-roma-16-17', category: 'lodging', country: 'italy', title: 'Roma', detail: '16 -> 17', euro: { min: 68, max: 68 }, real: { min: 434, max: 434 } },
  { id: 'lodging-milao-17-19', category: 'lodging', country: 'italy', title: 'Milao', detail: '17 -> 19', euro: { min: 165, max: 165 }, real: { min: 1055.04, max: 1055.04 } },
  { id: 'lodging-paris-19-21', category: 'lodging', country: 'france', title: 'Paris', detail: '19 -> 21', euro: { min: 221, max: 221 }, real: { min: 1416.67, max: 1416.67 } },
  { id: 'lodging-roma-20-21', category: 'lodging', country: 'italy', title: 'Roma', detail: '20 -> 21', euro: { min: 111, max: 111 }, real: { min: 708, max: 708 } },
  { id: 'transport-fiumicino-termini', category: 'transport', country: 'italy', title: 'Fiumicino -> Roma Termini', euro: { min: 28, max: 28 }, real: { min: 179, max: 179 } },
  { id: 'transport-roma-milao', category: 'transport', country: 'italy', title: 'Roma -> Milao', euro: { min: 59.8, max: 59.8 }, real: { min: 383, max: 383 } },
  { id: 'transport-milao-tirano', category: 'transport', country: 'italy', title: 'Milao -> Tirano', euro: { min: 26, max: 32 }, real: { min: 166, max: 205 } },
  { id: 'transport-tirano-stmoritz', category: 'transport', country: 'switzerland', title: 'Tirano -> St. Moritz', euro: { min: 68, max: 68 }, real: { min: 435, max: 435 } },
  { id: 'transport-stmoritz-tirano', category: 'transport', country: 'italy', title: 'St. Moritz -> Tirano', euro: { min: 68, max: 68 }, real: { min: 435, max: 435 } },
  { id: 'transport-tirano-milao', category: 'transport', country: 'italy', title: 'Tirano -> Milao', euro: { min: 26, max: 32 }, real: { min: 166, max: 205 } },
  { id: 'transport-voo-milao-paris', category: 'transport', country: 'france', title: 'Voo Milao -> Paris', euro: { min: 61, max: 61 }, real: { min: 392, max: 392 } },
  { id: 'transport-cdg-paris', category: 'transport', country: 'france', title: 'CDG -> Hospedagem Paris', euro: { min: 28, max: 28 }, real: { min: 179, max: 179 } },
  { id: 'transport-louvre', category: 'transport', country: 'france', title: 'Louvre ida/volta', euro: { min: 10.2, max: 10.2 }, real: { min: 65, max: 65 } },
  { id: 'transport-psg', category: 'transport', country: 'france', title: 'PSG ida/volta', euro: { min: 10.2, max: 10.2 }, real: { min: 65, max: 65 } },
  { id: 'transport-orly', category: 'transport', country: 'france', title: 'Hospedagem -> Orly', euro: { min: 28, max: 28 }, real: { min: 179, max: 179 } },
  { id: 'transport-voo-paris-roma', category: 'transport', country: 'italy', title: 'Voo Paris -> Roma', euro: { min: 96, max: 96 }, real: { min: 616, max: 616 } },
  { id: 'tour-coliseu', category: 'tours', country: 'italy', title: 'Coliseu + Forum + Palatino', euro: { min: 40, max: 40 }, real: { min: 256, max: 256 } },
  { id: 'tour-vaticano', category: 'tours', country: 'italy', title: 'Vaticano + Capela Sistina', euro: { min: 50, max: 50 }, real: { min: 320, max: 320 } },
  { id: 'tour-louvre', category: 'tours', country: 'france', title: 'Louvre', euro: { min: 44, max: 44 }, real: { min: 282, max: 282 } },
  { id: 'tour-sena', category: 'tours', country: 'france', title: 'Passeio de gondola/barco no Sena', euro: { min: 36, max: 36 }, real: { min: 230, max: 230 } },
];
