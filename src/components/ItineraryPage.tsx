import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BedDouble,
  CalendarDays,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  Coffee,
  Edit3,
  FileText,
  MapPin,
  Plane,
  Plus,
  RotateCcw,
  Route,
  ShoppingBag,
  Sparkles,
  Train,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  buildCountryOptions,
  countryAccent,
  countryLabel,
  normalizeCountryId,
} from '../data/countries';
import { itineraryItems } from '../data/itinerary';
import {
  cacheItineraryFallback,
  createItineraryItem,
  deleteItineraryItem,
  getCachedItineraryItems,
  getItineraryItems,
  resetItineraryToDefault,
  subscribeItineraryItems,
  updateItineraryItem,
  updateItineraryItemCompleted,
} from '../services/itineraryService';
import { supabase } from '../services/supabaseClient';
import type { CountryFilterId, CountryId, CountryMeta, ItineraryItem, ItineraryType, LinkItem } from '../types';
import { hasInvalidLinks, normalizeLinks } from '../utils/links';
import { CountryFilter } from './CountryFilter';
import { LinksEditor } from './LinksEditor';
import { LinksMenu } from './LinksMenu';
import { TimeField } from './TimeField';

type ItineraryPageProps = {
  groupId: string;
  tripCountries: string[];
  tripStartDate?: string;
  tripEndDate?: string;
  selectedCountry: CountryFilterId;
  onCountryChange: (country: CountryFilterId) => void;
  canUseDefaultData?: boolean;
};

type CalendarDay = {
  id: string;
  dayValue: string;
  title: string;
  subtitle: string;
  monthLabel?: string;
  weekdayLabel?: string;
  dateKey?: string;
  date?: Date;
  items: ItineraryItem[];
  itemCount: number;
  completedCount: number;
  isComplete: boolean;
  isToday: boolean;
};

const typeIcons: Record<ItineraryType, typeof MapPin> = {
  arrival: MapPin,
  lodging: BedDouble,
  tour: Sparkles,
  transport: Route,
  food: Utensils,
  flight: Plane,
  train: Train,
  motorhome: Car,
  shopping: ShoppingBag,
  document: FileText,
  rest: Coffee,
  other: Sparkles,
};

const typeLabels: Record<ItineraryType, string> = {
  arrival: 'Chegada',
  lodging: 'Hospedagem',
  tour: 'Passeio',
  transport: 'Transporte',
  food: 'Alimentacao',
  flight: 'Voo',
  train: 'Trem',
  motorhome: 'Motorhome',
  shopping: 'Compras',
  document: 'Documento',
  rest: 'Descanso',
  other: 'Outro',
};

const editableTypes: Array<{ id: ItineraryType; label: string }> = [
  { id: 'arrival', label: 'Chegada' },
  { id: 'tour', label: 'Passeio' },
  { id: 'transport', label: 'Transporte' },
  { id: 'food', label: 'Alimentacao' },
  { id: 'lodging', label: 'Hospedagem' },
  { id: 'flight', label: 'Voo' },
  { id: 'train', label: 'Trem' },
  { id: 'motorhome', label: 'Motorhome' },
  { id: 'shopping', label: 'Compras' },
  { id: 'document', label: 'Documento' },
  { id: 'rest', label: 'Descanso' },
  { id: 'other', label: 'Outro' },
];

const blankItem = (country: CountryId): ItineraryItem => ({
  id: crypto.randomUUID(),
  day: '',
  country,
  city: '',
  time: '',
  title: '',
  description: '',
  type: 'tour',
  completed: false,
  links: [],
});

const blankItemForDay = (country: CountryId, day: string): ItineraryItem => ({
  ...blankItem(country),
  day,
});

const groupByDay = (items: ItineraryItem[]) =>
  items.reduce<Record<string, ItineraryItem[]>>((groups, item) => {
    groups[item.day] = [...(groups[item.day] ?? []), item];
    return groups;
  }, {});

const dayNumberPattern = /(?:dia|day)\s*(\d{1,3})/i;
const datePattern = /(\d{4})-(\d{2})-(\d{2})/;
const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const monthLabels = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const parseDateKey = (value?: string) => {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const daysBetweenInclusive = (startDate: Date, endDate: Date) => {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
};

const formatDateLabel = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);

const normalizeDayId = (day: string) => day.trim() || 'Sem dia';

const extractDateKeyFromDay = (day: string) => {
  const match = day.match(datePattern);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const extractDayNumber = (day: string) => {
  const match = day.match(dayNumberPattern);
  if (!match) return null;

  const dayNumber = Number(match[1]);
  return Number.isFinite(dayNumber) ? dayNumber : null;
};

const getTripRange = (tripStartDate?: string, tripEndDate?: string) => {
  const startDate = parseDateKey(tripStartDate);
  const endDate = parseDateKey(tripEndDate);
  if (!startDate || !endDate || endDate < startDate) return null;

  return {
    startDate,
    endDate,
    days: Math.min(daysBetweenInclusive(startDate, endDate), 370),
  };
};

const getDateKeyForItem = (item: ItineraryItem, tripRange: ReturnType<typeof getTripRange>) => {
  if (!tripRange) return null;

  const explicitDate = extractDateKeyFromDay(item.day);
  if (explicitDate) return explicitDate;

  const dayNumber = extractDayNumber(item.day);
  if (!dayNumber) return null;

  if (dayNumber >= 1 && dayNumber <= tripRange.days) {
    return formatDateKey(addDays(tripRange.startDate, dayNumber - 1));
  }

  const sameMonthDate = new Date(tripRange.startDate.getFullYear(), tripRange.startDate.getMonth(), dayNumber);
  if (sameMonthDate >= tripRange.startDate && sameMonthDate <= tripRange.endDate) {
    return formatDateKey(sameMonthDate);
  }

  return null;
};

const buildCalendarDays = ({
  items,
  selectedDayId,
  tripStartDate,
  tripEndDate,
}: {
  items: ItineraryItem[];
  selectedDayId: string | null;
  tripStartDate?: string;
  tripEndDate?: string;
}): CalendarDay[] => {
  const todayKey = formatDateKey(new Date());
  const tripRange = getTripRange(tripStartDate, tripEndDate);

  if (tripRange) {
    const fallbackDateByDay = new Map<string, string>();
    items.forEach((item) => {
      if (getDateKeyForItem(item, tripRange)) return;

      const normalizedDay = normalizeDayId(item.day);
      if (!fallbackDateByDay.has(normalizedDay) && fallbackDateByDay.size < tripRange.days) {
        fallbackDateByDay.set(normalizedDay, formatDateKey(addDays(tripRange.startDate, fallbackDateByDay.size)));
      }
    });

    const itemsByDate = items.reduce<Record<string, ItineraryItem[]>>((groups, item) => {
      const dateKey = getDateKeyForItem(item, tripRange) ?? fallbackDateByDay.get(normalizeDayId(item.day));
      if (!dateKey) return groups;

      groups[dateKey] = [...(groups[dateKey] ?? []), item];
      return groups;
    }, {});

    return Array.from({ length: tripRange.days }, (_, index): CalendarDay => {
      const date = addDays(tripRange.startDate, index);
      const dateKey = formatDateKey(date);
      const dayItems = itemsByDate[dateKey] ?? [];
      const firstDayItem = dayItems[0];
      const completedCount = dayItems.filter((item) => item.completed).length;

      return {
        id: dateKey,
        dayValue: firstDayItem?.day ?? `Dia ${index + 1} - ${dateKey}`,
        title: `Dia ${index + 1}`,
        subtitle: formatDateLabel(date),
        monthLabel: monthLabels[date.getMonth()],
        weekdayLabel: dayLabels[date.getDay()],
        dateKey,
        date,
        items: dayItems,
        itemCount: dayItems.length,
        completedCount,
        isComplete: dayItems.length > 0 && completedCount === dayItems.length,
        isToday: dateKey === todayKey,
      };
    });
  }

  const groupedItems = groupByDay(items);
  const fallbackEntries = Object.entries(groupedItems);
  if (selectedDayId && !groupedItems[selectedDayId]) fallbackEntries.push([selectedDayId, []]);

  return fallbackEntries.map(([day, dayItems]) => {
    const completedCount = dayItems.filter((item) => item.completed).length;

    return {
      id: normalizeDayId(day),
      dayValue: day,
      title: day,
      subtitle: dayItems.length ? `${dayItems.length} atividade(s)` : 'Sem atividades',
      items: dayItems,
      itemCount: dayItems.length,
      completedCount,
      isComplete: dayItems.length > 0 && completedCount === dayItems.length,
      isToday: false,
    };
  });
};

function ItineraryFormModal({
  item,
  countryOptions,
  dayOptions,
  onClose,
  onSave,
}: {
  item: ItineraryItem | null;
  countryOptions: CountryMeta[];
  dayOptions: Array<{ value: string; label: string }>;
  onClose: () => void;
  onSave: (item: ItineraryItem) => void;
}) {
  const selectableCountryOptions = useMemo(
    () =>
      countryOptions.some((country) => country.id !== 'all')
        ? countryOptions
        : buildCountryOptions(['international'], [], { includeInternational: true }),
    [countryOptions],
  );
  const defaultCountry = selectableCountryOptions.find((country) => country.id !== 'all')?.id ?? 'international';
  const [draft, setDraft] = useState<ItineraryItem>(() => blankItem(defaultCountry));
  const [links, setLinks] = useState<LinkItem[]>([]);

  useEffect(() => {
    const source = item ?? blankItem(defaultCountry);
    setDraft({ ...source, country: normalizeCountryId(source.country) });
    setLinks(source.links ?? []);
  }, [defaultCountry, item]);

  const updateDraft = <K extends keyof ItineraryItem>(key: K, value: ItineraryItem[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasInvalidLinks(links)) return;
    onSave({
      ...draft,
      day: draft.day.trim(),
      city: draft.city.trim(),
      time: draft.time.trim(),
      title: draft.title.trim(),
      description: draft.description.trim(),
      links: normalizeLinks(links),
    });
  };

  return (
    <AnimatePresence>
      {item ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm md:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.form
            onSubmit={handleSubmit}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl shadow-slate-950/30 md:p-7"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
                  Roteiro
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  {item.title ? 'Editar item' : 'Novo item'}
                </h2>
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-2xl border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-50">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Dia</span>
                <input required list="itinerary-day-options" value={draft.day} onChange={(event) => updateDraft('day', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
                <datalist id="itinerary-day-options">
                  {dayOptions.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </datalist>
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Pais</span>
                <select value={draft.country} onChange={(event) => updateDraft('country', event.target.value as CountryId)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100">
                  {selectableCountryOptions.filter((country) => country.id !== 'all').map((country) => (
                    <option key={country.id} value={country.id}>{country.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Cidade</span>
                <input required value={draft.city} onChange={(event) => updateDraft('city', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
              </label>
              <TimeField value={draft.time} onChange={(value) => updateDraft('time', value)} label="Horario" />
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-600">Titulo</span>
                <input required value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Tipo</span>
                <select value={draft.type} onChange={(event) => updateDraft('type', event.target.value as ItineraryType)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100">
                  {editableTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.label}</option>
                  ))}
                </select>
              </label>
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-600">Descricao</span>
                <textarea required value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} rows={4} className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
              </label>
              <LinksEditor links={links} onChange={setLinks} />
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50">Cancelar</button>
              <button type="submit" className="h-12 rounded-2xl bg-slate-950 px-6 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700">Salvar item</button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function ItineraryPage({
  groupId,
  tripCountries,
  tripStartDate,
  tripEndDate,
  selectedCountry,
  onCountryChange,
  canUseDefaultData = false,
}: ItineraryPageProps) {
  const [items, setItems] = useState<ItineraryItem[]>(() => getCachedItineraryItems(groupId));
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ItineraryItem | null>(null);
  const [itemPendingDelete, setItemPendingDelete] = useState<ItineraryItem | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setItems(getCachedItineraryItems(groupId));

    const syncItems = async () => {
      try {
        setIsLoading(true);
        const nextItems = await getItineraryItems(groupId);
        if (active) {
          setItems(nextItems);
          setSyncWarning(null);
        }
      } catch {
        if (active) setSyncWarning('Supabase indisponivel. Mostrando cache local do roteiro.');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void syncItems();
    const channel = subscribeItineraryItems(groupId, () => {
      void getItineraryItems(groupId)
        .then((nextItems) => {
          if (active) {
            setItems(nextItems);
            setSyncWarning(null);
          }
        })
        .catch(() => {
          if (active) setSyncWarning('Nao foi possivel sincronizar o roteiro em tempo real.');
        });
    });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [groupId]);

  useEffect(() => {
    cacheItineraryFallback(groupId, items);
  }, [groupId, items]);

  const tripCountryIds = useMemo(
    () => new Set(tripCountries.map((country) => normalizeCountryId(country))),
    [tripCountries],
  );

  const scopedItems = useMemo(
    () =>
      tripCountryIds.size
        ? items.filter((item) => {
            const countryId = normalizeCountryId(item.country);
            return countryId === 'international' || tripCountryIds.has(countryId);
          })
        : items,
    [items, tripCountryIds],
  );

  const countryOptions = useMemo(
    () => buildCountryOptions(scopedItems.map((item) => item.country), tripCountries),
    [scopedItems, tripCountries],
  );

  const defaultCountry = countryOptions.find((country) => country.id !== 'all')?.id ?? 'international';

  useEffect(() => {
    if (selectedCountry !== 'all' && !countryOptions.some((country) => country.id === selectedCountry)) {
      onCountryChange('all');
    }
  }, [countryOptions, onCountryChange, selectedCountry]);

  const filteredItems = useMemo(
    () =>
      selectedCountry === 'all'
        ? scopedItems
        : scopedItems.filter((item) => normalizeCountryId(item.country) === selectedCountry),
    [scopedItems, selectedCountry],
  );

  const calendarDays = useMemo(
    () =>
      buildCalendarDays({
        items: filteredItems,
        selectedDayId,
        tripStartDate,
        tripEndDate,
      }),
    [filteredItems, selectedDayId, tripEndDate, tripStartDate],
  );

  useEffect(() => {
    if (!calendarDays.length) {
      if (selectedDayId !== null) setSelectedDayId(null);
      return;
    }

    if (!selectedDayId || !calendarDays.some((day) => day.id === selectedDayId)) {
      setSelectedDayId(calendarDays[0].id);
    }
  }, [calendarDays, selectedDayId]);

  const selectedDay = useMemo(
    () => calendarDays.find((day) => day.id === selectedDayId) ?? calendarDays[0] ?? null,
    [calendarDays, selectedDayId],
  );

  const dayOptions = useMemo(
    () =>
      calendarDays.map((day) => ({
        value: day.dayValue,
        label: day.dateKey ? `${day.title} - ${day.subtitle}` : day.title,
      })),
    [calendarDays],
  );

  const selectedDayItems = selectedDay?.items ?? [];
  const selectedDaySummary = selectedDay
    ? `${selectedDay.completedCount}/${selectedDay.itemCount} concluida(s)`
    : 'Sem dias disponiveis';

  const toggleExpanded = (id: string) => {
    setExpandedItems((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectDayForItem = (targetItem: ItineraryItem, nextItems: ItineraryItem[]) => {
    const nextDays = buildCalendarDays({
      items: selectedCountry === 'all'
        ? nextItems
        : nextItems.filter((item) => normalizeCountryId(item.country) === selectedCountry),
      selectedDayId,
      tripStartDate,
      tripEndDate,
    });
    const targetDay = nextDays.find((day) => day.items.some((item) => item.id === targetItem.id));
    if (targetDay) setSelectedDayId(targetDay.id);
  };

  const openNewItemModal = () => {
    setEditingItem(blankItemForDay(defaultCountry, selectedDay?.dayValue ?? 'Dia 1'));
  };

  const saveItem = async (item: ItineraryItem) => {
    const isEditing = items.some((currentItem) => currentItem.id === item.id);
    setIsSaving(true);

    try {
      const savedItem = isEditing
        ? await updateItineraryItem(groupId, item.id, item)
        : await createItineraryItem(groupId, item, items.length);
      const nextItems = isEditing
        ? items.map((currentItem) => (currentItem.id === savedItem.id ? savedItem : currentItem))
        : [...items, savedItem];
      setItems(nextItems);
      selectDayForItem(savedItem, nextItems);
      setSyncWarning(null);
      setEditingItem(null);
    } catch {
      const nextItems = isEditing
        ? items.map((currentItem) => (currentItem.id === item.id ? item : currentItem))
        : [...items, item];
      setItems(nextItems);
      selectDayForItem(item, nextItems);
      setSyncWarning('Nao foi possivel salvar no Supabase. Alteracao mantida no cache local.');
      setEditingItem(null);
    } finally {
      setIsSaving(false);
    }
  };

  const removeItem = async (id: string) => {
    const previousItems = items;
    setIsSaving(true);
    setItems((current) => current.filter((currentItem) => currentItem.id !== id));
    setItemPendingDelete(null);

    try {
      await deleteItineraryItem(groupId, id);
      setSyncWarning(null);
    } catch {
      setItems(previousItems);
      setSyncWarning('Nao foi possivel excluir no Supabase. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleCompleted = async (item: ItineraryItem) => {
    const completed = !(item.completed ?? false);
    const previousItems = items;
    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id ? { ...currentItem, completed } : currentItem,
      ),
    );

    try {
      await updateItineraryItemCompleted(groupId, item.id, completed);
      setSyncWarning(null);
    } catch {
      setItems(previousItems);
      setSyncWarning('Nao foi possivel salvar o check no Supabase. Tente novamente.');
    }
  };

  const restoreDefaults = async () => {
    setIsSaving(true);

    try {
      setItems(await resetItineraryToDefault(groupId));
      setSyncWarning(null);
    } catch {
      setItems(itineraryItems);
      setSyncWarning('Nao foi possivel restaurar no Supabase. Restauracao aplicada apenas localmente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
      <section className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-900/10 backdrop-blur-xl md:p-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Roteiro</p>
        <div className="mt-3 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Roteiro da viagem</h1>
            <p className="mt-4 max-w-3xl leading-7 text-slate-600">Linha do tempo da viagem ativa, com transporte, passeios, hospedagens e pausas do grupo selecionado.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={openNewItemModal} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700">
              <Plus className="h-5 w-5" /> Novo item
            </button>
            {canUseDefaultData ? (
              <button type="button" onClick={() => void restoreDefaults()} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 font-bold text-slate-700 transition hover:bg-slate-50">
                <RotateCcw className="h-5 w-5" /> Restaurar roteiro padrão
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <CountryFilter value={selectedCountry} onChange={onCountryChange} label="Filtrar roteiro por pais" options={countryOptions} />
      {syncWarning || isLoading || isSaving ? (
        <p className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-sm font-semibold text-slate-600 shadow-lg shadow-slate-900/5 backdrop-blur-xl">
          {isSaving ? 'Salvando roteiro no Supabase...' : isLoading ? 'Sincronizando roteiro...' : syncWarning}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <motion.section
          className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-xl shadow-slate-900/10 backdrop-blur-xl md:p-6 xl:sticky xl:top-28 xl:self-start"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">Calendario</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Dias da viagem</h2>
            </div>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <CalendarDays className="h-5 w-5" />
            </span>
          </div>

          {calendarDays.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
              {calendarDays.map((day) => {
                const selected = day.id === selectedDay?.id;
                const hasItems = day.itemCount > 0;

                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => setSelectedDayId(day.id)}
                    aria-label={`Selecionar ${day.title}`}
                    className={`min-h-28 rounded-2xl border p-3 text-left transition ${
                      selected
                        ? 'border-slate-950 bg-slate-950 text-white shadow-xl shadow-slate-950/20'
                        : hasItems
                          ? 'border-teal-200 bg-teal-50/70 text-slate-900 hover:border-teal-300 hover:bg-teal-50'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`text-xs font-black uppercase tracking-[0.12em] ${selected ? 'text-white/60' : 'text-slate-400'}`}>
                          {day.weekdayLabel ?? 'Dia'}
                        </p>
                        <p className="mt-1 text-lg font-black">{day.title}</p>
                      </div>
                      {day.isToday ? (
                        <span className={`rounded-full px-2 py-1 text-[0.65rem] font-black uppercase ${selected ? 'bg-white/15 text-white' : 'bg-amber-100 text-amber-700'}`}>
                          Hoje
                        </span>
                      ) : null}
                    </div>
                    <p className={`mt-2 text-xs font-bold ${selected ? 'text-white/70' : 'text-slate-500'}`}>
                      {day.date ? `${String(day.date.getDate()).padStart(2, '0')} ${day.monthLabel}` : day.subtitle}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className={`text-xs font-black ${selected ? 'text-white' : hasItems ? 'text-teal-700' : 'text-slate-400'}`}>
                        {day.itemCount} item(ns)
                      </span>
                      {day.isComplete ? (
                        <CheckCircle2 className={`h-4 w-4 ${selected ? 'text-teal-200' : 'text-teal-600'}`} />
                      ) : hasItems ? (
                        <span className={`h-2 w-2 rounded-full ${selected ? 'bg-teal-200' : 'bg-teal-600'}`} />
                      ) : (
                        <span className={`h-2 w-2 rounded-full ${selected ? 'bg-white/30' : 'bg-slate-300'}`} />
                      )}
                    </div>
                    {hasItems ? (
                      <div className={`mt-3 h-1.5 overflow-hidden rounded-full ${selected ? 'bg-white/15' : 'bg-white'}`}>
                        <span
                          className={`block h-full rounded-full ${selected ? 'bg-teal-200' : 'bg-teal-600'}`}
                          style={{ width: `${Math.max(8, (day.completedCount / day.itemCount) * 100)}%` }}
                        />
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-2xl bg-slate-50 px-4 py-5 text-sm font-bold leading-6 text-slate-500">
              Nenhum dia disponivel. Adicione datas na viagem ou crie o primeiro item do roteiro.
            </p>
          )}
        </motion.section>

        <motion.section
          layout
          className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-xl shadow-slate-900/10 backdrop-blur-xl md:p-7"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          {selectedDay ? (
            <>
              <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">Roteiro do dia</p>
                  <h2 className="mt-1 text-3xl font-black text-slate-950">{selectedDay.title}</h2>
                  <p className="mt-2 text-sm font-bold text-slate-500">{selectedDay.subtitle}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <span className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-600">
                    {selectedDaySummary}
                  </span>
                  <button type="button" onClick={openNewItemModal} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700">
                    <Plus className="h-5 w-5" /> Adicionar atividade
                  </button>
                </div>
              </div>

              {selectedDayItems.length ? (
                <div className="relative space-y-3 before:absolute before:bottom-4 before:left-5 before:top-4 before:w-px before:bg-slate-200 md:before:left-6">
                  <AnimatePresence mode="popLayout">
                    {selectedDayItems.map((item) => {
                  const Icon = typeIcons[item.type];
                  const expanded = expandedItems.has(item.id);
                  const completed = item.completed ?? false;

                  return (
                    <motion.article
                      layout
                      key={item.id}
                      className={`relative ml-11 rounded-3xl border p-4 shadow-sm transition md:ml-14 md:p-5 ${
                        completed
                          ? 'border-teal-300 bg-teal-50/90 shadow-teal-900/10 hover:border-teal-400'
                          : 'border-slate-200 bg-white hover:border-teal-200 hover:shadow-lg hover:shadow-slate-900/10'
                      }`}
                      initial={{ opacity: 1, x: 0 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 14 }}
                    >
                      <span className={`absolute -left-[2.95rem] top-4 flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-lg md:-left-[3.45rem] ${completed ? 'bg-teal-600' : 'bg-slate-950'}`}>
                        {completed ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                      </span>
                      <div className="flex gap-3">
                        <button type="button" onClick={() => toggleExpanded(item.id)} className="flex min-w-0 flex-1 flex-col gap-3 text-left md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-3 py-1 text-xs font-black ${completed ? 'bg-white/80 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>{item.time || 'Sem horario'}</span>
                              <span
                                className="rounded-full px-3 py-1 text-xs font-black ring-1"
                                style={{
                                  backgroundColor: `${countryAccent(item.country)}14`,
                                  color: countryAccent(item.country),
                                  borderColor: `${countryAccent(item.country)}33`,
                                }}
                              >
                                {countryLabel(item.country)}
                              </span>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-400 ring-1 ring-slate-200">{typeLabels[item.type]}</span>
                            </div>
                            <h3 className={`mt-3 text-lg font-black ${completed ? 'text-teal-950' : 'text-slate-950'}`}>{item.title}</h3>
                            <p className={`mt-1 text-sm font-semibold ${completed ? 'text-teal-700' : 'text-slate-500'}`}>{item.city}</p>
                          </div>
                          <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                          <LinksMenu links={item.links} align="right" />
                          <button type="button" aria-label={`${completed ? 'Desmarcar' : 'Marcar'} ${item.title}`} onClick={() => void toggleCompleted(item)} className={`h-10 rounded-xl border p-2 transition ${completed ? 'border-teal-200 bg-teal-600 text-white' : 'border-slate-200 text-slate-500 hover:bg-teal-50 hover:text-teal-700'}`}><Check className="h-4 w-4" /></button>
                          <button type="button" aria-label={`Editar ${item.title}`} onClick={() => setEditingItem(item)} className="h-10 rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-teal-50 hover:text-teal-700"><Edit3 className="h-4 w-4" /></button>
                          <button type="button" aria-label={`Excluir ${item.title}`} onClick={() => setItemPendingDelete(item)} className="h-10 rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                      <AnimatePresence>
                        {expanded ? (
                          <motion.p className="mt-4 rounded-2xl bg-slate-50 p-4 leading-7 text-slate-600" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                            {item.description}
                          </motion.p>
                        ) : null}
                      </AnimatePresence>
                    </motion.article>
                  );
                    })}
                  </AnimatePresence>
                </div>
              ) : (
                <p className="rounded-2xl bg-slate-50 px-4 py-6 text-sm font-bold leading-6 text-slate-500">
                  Nenhuma atividade cadastrada para este dia.
                </p>
              )}
            </>
          ) : (
            <p className="rounded-2xl bg-slate-50 px-4 py-6 text-sm font-bold leading-6 text-slate-500">
              Nenhum roteiro encontrado para esta viagem.
            </p>
          )}
        </motion.section>
      </div>

      <ItineraryFormModal item={editingItem} countryOptions={countryOptions} dayOptions={dayOptions} onClose={() => setEditingItem(null)} onSave={(item) => void saveItem(item)} />
      <AnimatePresence>
        {itemPendingDelete ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm md:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setItemPendingDelete(null)}
          >
            <motion.div
              className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl shadow-slate-950/30"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
                  <AlertTriangle className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-rose-700">Excluir atividade</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">
                    Tem certeza que deseja excluir esta atividade?
                  </h2>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                    {itemPendingDelete.title}
                  </p>
                </div>
              </div>
              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setItemPendingDelete(null)}
                  className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void removeItem(itemPendingDelete.id)}
                  disabled={isSaving}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 font-bold text-white shadow-xl shadow-rose-900/20 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Trash2 className="h-5 w-5" />
                  Excluir
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
