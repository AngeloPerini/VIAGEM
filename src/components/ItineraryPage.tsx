import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BedDouble,
  Car,
  Check,
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
  countryLabel,
  normalizeCountryId,
} from '../data/countries';
import { itineraryItems } from '../data/itinerary';
import {
  createItineraryActivityTask,
  deleteItineraryActivityTask,
  getItineraryActivityTasks,
  setItineraryActivityTaskCompleted,
  subscribeItineraryActivityTasks,
  updateItineraryActivityTask,
} from '../services/itineraryActivityTasksService';
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
import type { CountryFilterId, CountryId, CountryMeta, ItineraryActivityTask, ItineraryItem, ItineraryType, LinkItem } from '../types';
import {
  addDateOnlyDays,
  daysBetweenDateOnlyInclusive,
  formatDateOnlyKey,
  formatItineraryDateShort,
  formatItineraryDateWithYear,
  formatItineraryDayLabel,
  formatItineraryPeriodLabel,
  getItineraryDate,
  parseDateOnlyLocal,
} from '../utils/dateRange';
import { hasInvalidLinks, normalizeLinks } from '../utils/links';
import { ActivityTasks } from './ActivityTasks';
import { LinksEditor } from './LinksEditor';
import { LinksMenu } from './LinksMenu';
import { TimeField } from './TimeField';

type ItineraryPageProps = {
  groupId: string;
  tripName?: string;
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
  dayNumber: number;
  dateLabel?: string;
  dateDayLabel?: string;
  monthLabel?: string;
  weekdayLabel?: string;
  fullDateLabel?: string;
  dateKey?: string;
  date?: Date;
  items: ItineraryItem[];
  itemCount: number;
  completedCount: number;
  isComplete: boolean;
  isToday: boolean;
};

type TripRange = {
  startDate: Date;
  endDate: Date;
  days: number;
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

const getDayNumberLabel = (title: string, index: number) => {
  const dayNumber = extractDayNumber(title) ?? index + 1;
  return String(dayNumber).padStart(2, '0');
};

const isDateWithinTripRange = (date: Date, tripRange: TripRange) =>
  date >= tripRange.startDate && date <= tripRange.endDate;

const getDayStatusLabel = (day: CalendarDay, selected: boolean) => {
  if (!day.itemCount) return '0%';
  if (selected && !day.isComplete) return 'Em curso';
  return `${Math.round((day.completedCount / day.itemCount) * 100)}%`;
};

const parseTimeMinutes = (time?: string) => {
  const match = String(time ?? '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const getRelativeTimeLabel = (item: ItineraryItem | null, selectedDay: CalendarDay | null) => {
  if (!item?.time) return 'programada';
  if (!selectedDay?.date) return 'horario definido';

  const itemMinutes = parseTimeMinutes(item.time);
  if (itemMinutes === null) return 'horario definido';

  const now = new Date();
  const sameDay = formatDateOnlyKey(now) === formatDateOnlyKey(selectedDay.date);
  if (!sameDay) return selectedDay.subtitle;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const delta = itemMinutes - currentMinutes;
  if (delta > 60) return `em ${Math.round(delta / 60)}h`;
  if (delta > 0) return `em ${delta} minutos`;
  return 'em andamento';
};

const getDayTimeEstimate = (items: ItineraryItem[]) => {
  const sortedMinutes = items
    .map((item) => parseTimeMinutes(item.time))
    .filter((minutes): minutes is number => minutes !== null)
    .sort((a, b) => a - b);

  if (sortedMinutes.length >= 2) {
    const durationHours = Math.max(1, Math.round((sortedMinutes[sortedMinutes.length - 1] - sortedMinutes[0]) / 60));
    return `${durationHours}h em agenda`;
  }

  if (items.length) return `${items.length} bloco${items.length === 1 ? '' : 's'} planejado${items.length === 1 ? '' : 's'}`;
  return 'Sem atividades';
};

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

const getTripRange = (tripStartDate?: string, tripEndDate?: string): TripRange | null => {
  const startDate = parseDateOnlyLocal(tripStartDate);
  const endDate = parseDateOnlyLocal(tripEndDate);
  if (!startDate || !endDate || endDate < startDate) return null;

  return {
    startDate,
    endDate,
    days: Math.min(daysBetweenDateOnlyInclusive(startDate, endDate), 370),
  };
};

const getDateKeyForItem = (item: ItineraryItem, tripRange: TripRange | null) => {
  if (!tripRange) return null;

  const explicitDate = parseDateOnlyLocal(extractDateKeyFromDay(item.day));
  if (explicitDate && isDateWithinTripRange(explicitDate, tripRange)) {
    return formatDateOnlyKey(explicitDate);
  }

  const dayNumber = extractDayNumber(item.day);
  if (!dayNumber) return null;

  if (dayNumber >= 1 && dayNumber <= tripRange.days) {
    const date = getItineraryDate(tripRange.startDate, dayNumber);
    return date ? formatDateOnlyKey(date) : null;
  }

  const sameMonthDate = new Date(tripRange.startDate.getFullYear(), tripRange.startDate.getMonth(), dayNumber);
  if (isDateWithinTripRange(sameMonthDate, tripRange)) {
    return formatDateOnlyKey(sameMonthDate);
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
  const todayKey = formatDateOnlyKey(new Date());
  const tripRange = getTripRange(tripStartDate, tripEndDate);

  if (tripRange) {
    const fallbackDateByDay = new Map<string, string>();
    items.forEach((item) => {
      if (getDateKeyForItem(item, tripRange)) return;

      const normalizedDay = normalizeDayId(item.day);
      if (!fallbackDateByDay.has(normalizedDay) && fallbackDateByDay.size < tripRange.days) {
        fallbackDateByDay.set(normalizedDay, formatDateOnlyKey(addDateOnlyDays(tripRange.startDate, fallbackDateByDay.size)));
      }
    });

    const itemsByDate = items.reduce<Record<string, ItineraryItem[]>>((groups, item) => {
      const dateKey = getDateKeyForItem(item, tripRange) ?? fallbackDateByDay.get(normalizeDayId(item.day));
      if (!dateKey) return groups;

      groups[dateKey] = [...(groups[dateKey] ?? []), item];
      return groups;
    }, {});

    return Array.from({ length: tripRange.days }, (_, index): CalendarDay => {
      const date = addDateOnlyDays(tripRange.startDate, index);
      const dateKey = formatDateOnlyKey(date);
      const dayItems = itemsByDate[dateKey] ?? [];
      const firstDayItem = dayItems[0];
      const completedCount = dayItems.filter((item) => item.completed).length;
      const dateLabel = formatItineraryDayLabel(date);

      return {
        id: dateKey,
        dayValue: firstDayItem?.day ?? `Dia ${index + 1} - ${dateKey}`,
        title: `Dia ${index + 1}`,
        subtitle: formatItineraryDateWithYear(date),
        dayNumber: index + 1,
        dateLabel: dateLabel.compact,
        dateDayLabel: dateLabel.day,
        monthLabel: dateLabel.month,
        weekdayLabel: dateLabel.weekday,
        fullDateLabel: dateLabel.full,
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

  return fallbackEntries.map(([day, dayItems], index) => {
    const completedCount = dayItems.filter((item) => item.completed).length;

    return {
      id: normalizeDayId(day),
      dayValue: day,
      title: day,
      subtitle: dayItems.length ? `${dayItems.length} atividade(s)` : 'Sem atividades',
      dayNumber: extractDayNumber(day) ?? index + 1,
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
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl shadow-slate-950/30 md:p-7 dark:border dark:border-slate-700 dark:bg-slate-900"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-400">
                  Roteiro
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50">
                  {item.title ? 'Editar item' : 'Novo item'}
                </h2>
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-2xl border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Dia</span>
                <input required list="itinerary-day-options" value={draft.day} onChange={(event) => updateDraft('day', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-400 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20" />
                <datalist id="itinerary-day-options">
                  {dayOptions.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </datalist>
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Pais</span>
                <select value={draft.country} onChange={(event) => updateDraft('country', event.target.value as CountryId)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20">
                  {selectableCountryOptions.filter((country) => country.id !== 'all').map((country) => (
                    <option key={country.id} value={country.id}>{country.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Cidade</span>
                <input required value={draft.city} onChange={(event) => updateDraft('city', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-400 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20" />
              </label>
              <TimeField value={draft.time} onChange={(value) => updateDraft('time', value)} label="Horario" />
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Titulo</span>
                <input required value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-400 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20" />
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Tipo</span>
                <select value={draft.type} onChange={(event) => updateDraft('type', event.target.value as ItineraryType)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20">
                  {editableTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.label}</option>
                  ))}
                </select>
              </label>
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Descricao</span>
                <textarea required value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} rows={4} className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-400 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20" />
              </label>
              <LinksEditor links={links} onChange={setLinks} />
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
              <button type="submit" className="h-12 rounded-2xl bg-slate-950 px-6 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300">Salvar item</button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function ItineraryPage({
  groupId,
  tripName,
  tripCountries,
  tripStartDate,
  tripEndDate,
  selectedCountry,
  onCountryChange,
  canUseDefaultData = false,
}: ItineraryPageProps) {
  const [items, setItems] = useState<ItineraryItem[]>(() => getCachedItineraryItems(groupId));
  const [activityTasks, setActivityTasks] = useState<ItineraryActivityTask[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ItineraryItem | null>(null);
  const [itemPendingDelete, setItemPendingDelete] = useState<ItineraryItem | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [taskWarning, setTaskWarning] = useState<string | null>(null);
  const [taskActionId, setTaskActionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setItems(getCachedItineraryItems(groupId));
    setActivityTasks([]);

    const syncItems = async () => {
      try {
        setIsLoading(true);
        const [nextItems, nextTasks] = await Promise.all([
          getItineraryItems(groupId),
          getItineraryActivityTasks(groupId),
        ]);
        if (active) {
          setItems(nextItems);
          setActivityTasks(nextTasks);
          setSyncWarning(null);
          setTaskWarning(null);
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
    const taskChannel = subscribeItineraryActivityTasks(groupId, () => {
      void getItineraryActivityTasks(groupId)
        .then((nextTasks) => {
          if (active) {
            setActivityTasks(nextTasks);
            setTaskWarning(null);
          }
        })
        .catch(() => {
          if (active) setTaskWarning('Nao foi possivel sincronizar as tarefas em tempo real.');
        });
    });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
      void supabase.removeChannel(taskChannel);
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

  const tasksByItemId = useMemo(
    () =>
      activityTasks.reduce<Record<string, ItineraryActivityTask[]>>((groups, task) => {
        groups[task.itineraryItemId] = [...(groups[task.itineraryItemId] ?? []), task];
        return groups;
      }, {}),
    [activityTasks],
  );

  const selectedDayItems = selectedDay?.items ?? [];
  const selectedDaySummary = selectedDay
    ? `${selectedDay.completedCount}/${selectedDay.itemCount} concluida(s)`
    : 'Sem dias disponiveis';
  const selectedDayProgress = selectedDay?.itemCount
    ? Math.round((selectedDay.completedCount / selectedDay.itemCount) * 100)
    : 0;
  const itineraryProgress = filteredItems.length
    ? Math.round((filteredItems.filter((item) => item.completed).length / filteredItems.length) * 100)
    : 0;
  const selectedCountryMeta = countryOptions.find((country) => country.id === selectedCountry) ?? countryOptions[0];
  const selectedFilterItems = selectedCountry === 'all'
    ? scopedItems
    : scopedItems.filter((item) => normalizeCountryId(item.country) === selectedCountry);
  const selectedFilterCities = Array.from(
    new Set(selectedFilterItems.map((item) => item.city.trim()).filter(Boolean)),
  );
  const countrySelectLabel = selectedCountry === 'all'
    ? 'Todos os destinos'
    : `${selectedCountryMeta?.name ?? countryLabel(selectedCountry)}${
        selectedFilterCities[0] ? ` (${selectedFilterCities[0]})` : ''
      }`;
  const itineraryTitle = tripName?.trim() || 'Itinerario da viagem';
  const nextActivity = selectedDayItems.find((item) => !item.completed) ?? selectedDayItems[0] ?? null;
  const nextActivityIcon = nextActivity ? typeIcons[nextActivity.type] : Sparkles;
  const NextActivityIcon = nextActivityIcon;
  const currentLocation = nextActivity?.city || selectedDayItems.find((item) => item.city)?.city || selectedFilterCities[0] || countrySelectLabel;
  const selectedDayPendingCount = selectedDay ? selectedDay.itemCount - selectedDay.completedCount : 0;
  const selectedDayLocation = selectedDayItems.find((item) => item.city)?.city || countrySelectLabel;
  const selectedDayTimeEstimate = getDayTimeEstimate(selectedDayItems);
  const tripRange = useMemo(() => getTripRange(tripStartDate, tripEndDate), [tripEndDate, tripStartDate]);
  const itineraryPeriodLabel = tripRange ? formatItineraryPeriodLabel(tripRange.startDate, tripRange.endDate) : null;
  const selectedDayDateHeading = selectedDay?.fullDateLabel ?? selectedDay?.title ?? null;
  const nextActivityDateLabel = selectedDay?.date ? formatItineraryDateShort(selectedDay.date) : null;

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
    const previousTasks = activityTasks;
    setIsSaving(true);
    setItems((current) => current.filter((currentItem) => currentItem.id !== id));
    setActivityTasks((current) => current.filter((task) => task.itineraryItemId !== id));
    setItemPendingDelete(null);

    try {
      await deleteItineraryItem(groupId, id);
      setSyncWarning(null);
    } catch {
      setItems(previousItems);
      setActivityTasks(previousTasks);
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

  const addActivityTask = async (item: ItineraryItem, title: string) => {
    setTaskActionId(`create-${item.id}`);

    try {
      const createdTask = await createItineraryActivityTask(groupId, item.id, {
        title,
        source: 'manual',
      });
      setActivityTasks((current) => [...current, createdTask]);
      setTaskWarning(null);
    } catch (error) {
      setTaskWarning(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel adicionar a tarefa.',
      );
    } finally {
      setTaskActionId(null);
    }
  };

  const toggleActivityTask = async (task: ItineraryActivityTask) => {
    const previousTasks = activityTasks;
    const nextCompleted = !task.isCompleted;
    setTaskActionId(`toggle-${task.id}`);
    setActivityTasks((current) =>
      current.map((currentTask) =>
        currentTask.id === task.id ? { ...currentTask, isCompleted: nextCompleted } : currentTask,
      ),
    );

    try {
      const updatedTask = await setItineraryActivityTaskCompleted(groupId, task.id, nextCompleted);
      setActivityTasks((current) =>
        current.map((currentTask) => (currentTask.id === updatedTask.id ? updatedTask : currentTask)),
      );
      setTaskWarning(null);
    } catch {
      setActivityTasks(previousTasks);
      setTaskWarning('Nao foi possivel atualizar a tarefa. Tente novamente.');
    } finally {
      setTaskActionId(null);
    }
  };

  const updateActivityTaskTitle = async (task: ItineraryActivityTask, title: string) => {
    const previousTasks = activityTasks;
    setTaskActionId(`edit-${task.id}`);
    setActivityTasks((current) =>
      current.map((currentTask) =>
        currentTask.id === task.id ? { ...currentTask, title } : currentTask,
      ),
    );

    try {
      const updatedTask = await updateItineraryActivityTask(groupId, task.id, {
        title,
        description: task.description,
        isCompleted: task.isCompleted,
        source: task.source,
      });
      setActivityTasks((current) =>
        current.map((currentTask) => (currentTask.id === updatedTask.id ? updatedTask : currentTask)),
      );
      setTaskWarning(null);
    } catch (error) {
      setActivityTasks(previousTasks);
      setTaskWarning(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel editar a tarefa.',
      );
    } finally {
      setTaskActionId(null);
    }
  };

  const removeActivityTask = async (task: ItineraryActivityTask) => {
    const previousTasks = activityTasks;
    setTaskActionId(`delete-${task.id}`);
    setActivityTasks((current) => current.filter((currentTask) => currentTask.id !== task.id));

    try {
      await deleteItineraryActivityTask(groupId, task.id);
      setTaskWarning(null);
    } catch {
      setActivityTasks(previousTasks);
      setTaskWarning('Nao foi possivel excluir a tarefa. Tente novamente.');
    } finally {
      setTaskActionId(null);
    }
  };

  const restoreDefaults = async () => {
    setIsSaving(true);

    try {
      setItems(await resetItineraryToDefault(groupId));
      setActivityTasks([]);
      setSyncWarning(null);
      setTaskWarning(null);
    } catch {
      setItems(itineraryItems);
      setSyncWarning('Nao foi possivel restaurar no Supabase. Restauracao aplicada apenas localmente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      className="w-full max-w-full space-y-8 overflow-x-hidden"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
    >
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-[#0b1c30] md:text-xl dark:text-slate-50">{itineraryTitle}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-[#45464d] md:text-base dark:text-slate-300">
            <MapPin className="h-5 w-5 text-[#007c68] dark:text-emerald-300" />
            <span>{filteredItems.length} atividades planejadas • Roteiro da viagem</span>
            {itineraryPeriodLabel ? (
              <span className="text-[#667085] dark:text-slate-400">{itineraryPeriodLabel}</span>
            ) : null}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block">
            <span className="sr-only">Filtrar roteiro por pais</span>
            <select
              value={selectedCountry}
              onChange={(event) => onCountryChange(event.target.value)}
              className="h-11 w-full appearance-none rounded-xl border border-[#c6c6cd] bg-[#eff4ff] px-4 pr-11 text-sm font-semibold text-[#0b1c30] outline-none transition focus:border-[#007c68] focus:ring-4 focus:ring-[#48fdd3]/20 sm:w-64 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            >
              {countryOptions.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.id === 'all' ? 'Todos os destinos' : country.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#45464d] dark:text-slate-300" />
          </label>
          <button
            type="button"
            onClick={openNewItemModal}
            className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-center text-sm font-bold leading-tight text-white shadow-[0_12px_28px_rgba(15,23,42,0.12)] transition hover:bg-[#111827] dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300 sm:px-6"
          >
            <Plus className="h-5 w-5" /> Nova Atividade
          </button>
          {canUseDefaultData ? (
            <button
              type="button"
              onClick={() => void restoreDefaults()}
              className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-[#c6c6cd] bg-white px-4 py-2.5 text-center text-sm font-bold leading-tight text-[#45464d] transition hover:border-[#007c68] hover:text-[#007c68] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
            >
              <RotateCcw className="h-4 w-4" /> Restaurar
            </button>
          ) : null}
        </div>
      </section>

      {syncWarning || taskWarning || isLoading || isSaving ? (
        <p className="rounded-xl border border-[#d3e4fe] bg-white px-4 py-3 text-sm font-semibold text-[#45464d] shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {isSaving ? 'Salvando roteiro no Supabase...' : isLoading ? 'Sincronizando roteiro...' : syncWarning ?? taskWarning}
        </p>
      ) : null}

      <section className="relative">
        {calendarDays.length ? (
          <div className="max-w-full overflow-x-auto overscroll-x-contain pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max gap-3 sm:gap-4">
            {calendarDays.map((day, index) => {
              const selected = day.id === selectedDay?.id;
              const hasItems = day.itemCount > 0;
              const statusLabel = getDayStatusLabel(day, selected);
              const ariaLabel = day.fullDateLabel
                ? `Selecionar ${day.fullDateLabel}, dia ${day.dayNumber} da viagem`
                : `Selecionar ${day.title}`;

              return (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => setSelectedDayId(day.id)}
                  aria-current={selected ? 'date' : undefined}
                  aria-pressed={selected}
                  aria-label={ariaLabel}
                  className="group flex shrink-0 flex-col items-center gap-1 text-center focus-visible:outline-none"
                >
                  <span
                    className={`flex h-24 w-20 flex-col items-center justify-center rounded-2xl border px-2 transition group-focus-visible:ring-4 group-focus-visible:ring-[#48fdd3]/30 dark:group-focus-visible:ring-emerald-400/25 ${
                      selected
                        ? 'border-2 border-[#007c68] bg-[#48fdd3]/15 text-[#007c68] dark:border-emerald-400 dark:bg-emerald-400/15 dark:text-emerald-200'
                        : day.isComplete
                          ? 'border-[#9ed7ca] bg-[#eefbf8] text-[#0b1c30] hover:border-[#007c68] dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100 dark:hover:border-emerald-400'
                          : 'border-[#d7dbe4] bg-white text-[#667085] hover:border-[#007c68] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-emerald-400'
                    }`}
                  >
                    {day.dateLabel ? (
                      <>
                        <span className={`text-xs font-semibold uppercase ${selected ? 'text-[#007c68] dark:text-emerald-200' : 'text-[#667085] dark:text-slate-400'}`}>
                          {day.weekdayLabel}
                        </span>
                        <span className={`mt-1 text-2xl leading-none ${selected ? 'font-black' : 'font-bold'}`}>
                          {day.dateDayLabel}
                        </span>
                        <span className="mt-0.5 text-xs font-bold uppercase leading-none">
                          {day.monthLabel}
                        </span>
                        <span className={`mt-2 text-xs font-semibold ${selected ? 'text-[#005f51] dark:text-emerald-100' : 'text-[#8c8f9a] dark:text-slate-400'}`}>
                          Dia {day.dayNumber}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className={`text-xs font-semibold uppercase ${selected ? 'text-[#007c68] dark:text-emerald-200' : 'text-[#8c8f9a] dark:text-slate-400'}`}>
                          Dia
                        </span>
                        <span className={`mt-1 text-lg ${selected ? 'font-black' : 'font-medium'}`}>
                          {getDayNumberLabel(day.title, index)}
                        </span>
                      </>
                    )}
                  </span>
                  <span className={`h-1 w-20 rounded-full ${selected || day.isComplete ? 'bg-[#007c68] dark:bg-emerald-400' : 'bg-transparent group-hover:bg-[#d7dbe4] dark:group-hover:bg-slate-600'}`} />
                  <span className={`text-sm font-medium ${selected || hasItems ? 'text-[#007c68] dark:text-emerald-300' : 'text-[#8c8f9a] dark:text-slate-400'}`}>
                    {statusLabel}
                  </span>
                </button>
              );
            })}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#dfe5ee] bg-white px-5 py-6 text-sm font-semibold text-[#667085] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            Seu roteiro ainda nao foi criado.
            <button type="button" onClick={openNewItemModal} className="ml-2 font-black text-[#007c68] dark:text-emerald-300">
              Adicionar primeira atividade
            </button>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <motion.section
          layout
          className="min-w-0"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          {selectedDay ? (
            <>
              <div className="mb-7 ml-0 rounded-2xl border border-[#007c68] bg-white/75 p-5 shadow-sm md:ml-16 dark:border-emerald-500/60 dark:bg-emerald-500/10">
                {selectedDayDateHeading ? (
                  <p className="mb-4 text-sm font-semibold text-[#45464d] dark:text-slate-300">
                    {selectedDayDateHeading}
                  </p>
                ) : null}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#d8fbf4] text-[#007c68] dark:bg-emerald-400/15 dark:text-emerald-200">
                      <NextActivityIcon className="h-6 w-6" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#007c68] dark:text-emerald-300">Proxima atividade</p>
                      <h2 className="mt-1 truncate text-lg font-semibold text-[#0b1c30] dark:text-slate-50">
                        {nextActivity?.title ?? 'Nenhuma atividade pendente'}
                      </h2>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-lg font-medium text-[#0b1c30] dark:text-slate-100">
                      {nextActivityDateLabel ? `${nextActivityDateLabel} • ${nextActivity?.time || '--:--'}` : nextActivity?.time || '--:--'}
                    </p>
                    <p className="text-sm font-medium text-[#45464d] dark:text-slate-300">{getRelativeTimeLabel(nextActivity, selectedDay)}</p>
                  </div>
                </div>
              </div>

              {selectedDayItems.length ? (
                <div className="relative space-y-5 before:absolute before:bottom-6 before:left-6 before:top-4 before:w-px before:bg-[#c6c6cd]/55 dark:before:bg-slate-700">
                  <AnimatePresence mode="popLayout">
                    {selectedDayItems.map((item) => {
                      const Icon = typeIcons[item.type];
                      const expanded = expandedItems.has(item.id);
                      const completed = item.completed ?? false;
                      const isNext = nextActivity?.id === item.id && !completed;

                      return (
                        <motion.article
                          layout
                          key={item.id}
                          className={`relative ml-16 rounded-2xl border bg-white p-5 transition dark:bg-slate-900 ${
                            isNext
                              ? 'border-2 border-[#131b2e] shadow-[0_10px_24px_rgba(15,23,42,0.12)] dark:border-emerald-400 dark:shadow-emerald-950/20'
                              : completed
                                ? 'border-[#dfe5ee] shadow-sm dark:border-emerald-500/35'
                                : 'border-[#e5e9f0] opacity-70 shadow-sm hover:opacity-100 dark:border-slate-700 dark:opacity-100'
                          }`}
                          initial={{ opacity: 1, x: 0 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 14 }}
                        >
                          <span
                            className={`absolute -left-[4.25rem] top-5 grid h-12 w-12 place-items-center rounded-full border-4 border-[#f7f8fd] shadow-lg dark:border-slate-950 ${
                              completed
                                ? 'bg-[#007c68] text-white dark:bg-emerald-400 dark:text-emerald-950'
                                : isNext
                                  ? 'bg-[#131b2e] text-[#dce9ff] dark:bg-emerald-500/20 dark:text-emerald-200'
                                  : 'bg-[#dce9ff] text-[#7c839b] dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {completed ? <Check className="h-6 w-6" /> : <Icon className="h-6 w-6" />}
                          </span>

                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <button type="button" onClick={() => toggleExpanded(item.id)} className="min-w-0 flex-1 text-left">
                              <p className={`text-base font-semibold ${isNext ? 'text-[#007c68] dark:text-emerald-300' : 'text-[#45464d] dark:text-slate-300'}`}>
                                {item.time || 'Sem horario'}
                              </p>
                              <h3 className="mt-2 text-lg font-semibold text-[#0b1c30] dark:text-slate-50">{item.title}</h3>
                              {item.description ? (
                                <p className="mt-4 text-sm leading-6 text-[#45464d] dark:text-slate-300">{item.description}</p>
                              ) : null}
                              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-medium text-[#45464d] dark:text-slate-300">
                                <span className="inline-flex items-center gap-1.5">
                                  <MapPin className="h-4 w-4" />
                                  {item.city || countryLabel(item.country)}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <Icon className="h-4 w-4" />
                                  {typeLabels[item.type]}
                                </span>
                              </div>
                              <AnimatePresence>
                                {expanded ? (
                                  <motion.div
                                    className="mt-4 rounded-xl bg-[#f8f9ff] px-4 py-3 text-sm font-medium text-[#667085] dark:bg-slate-800 dark:text-slate-300"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                  >
                                    {item.links?.length ? 'Links e referencias disponiveis no menu de anexo.' : 'Nenhum link cadastrado para esta atividade.'}
                                  </motion.div>
                                ) : null}
                              </AnimatePresence>
                            </button>

                            <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
                              {isNext ? (
                                <button
                                  type="button"
                                  aria-label={`Marcar ${item.title}`}
                                  onClick={() => void toggleCompleted(item)}
                                  className="inline-flex h-9 items-center justify-center rounded-full bg-[#007c68] px-4 text-sm font-bold text-white transition hover:bg-[#005141] dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
                                >
                                  Check-in
                                </button>
                              ) : null}
                              <LinksMenu links={item.links} align="right" />
                              <button
                                type="button"
                                aria-label={`${completed ? 'Desmarcar' : 'Marcar'} ${item.title}`}
                                onClick={() => void toggleCompleted(item)}
                                className={`grid h-9 w-9 place-items-center rounded-xl transition ${
                                  completed ? 'bg-[#007c68] text-white dark:bg-emerald-400 dark:text-emerald-950' : 'border border-[#dfe5ee] text-[#45464d] hover:bg-[#eef8f6] hover:text-[#007c68] dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-emerald-300'
                                }`}
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button type="button" aria-label={`Editar ${item.title}`} onClick={() => setEditingItem(item)} className="grid h-9 w-9 place-items-center rounded-xl text-[#45464d] transition hover:bg-[#eef8f6] hover:text-[#007c68] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-emerald-300">
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button type="button" aria-label={`Excluir ${item.title}`} onClick={() => setItemPendingDelete(item)} className="grid h-9 w-9 place-items-center rounded-xl text-rose-700 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/15">
                                <Trash2 className="h-4 w-4" />
                              </button>
                              <ChevronDown className={`h-5 w-5 text-[#8c8f9a] transition dark:text-slate-400 ${expanded ? 'rotate-180' : ''}`} />
                            </div>
                          </div>

                          <ActivityTasks
                            itemId={item.id}
                            itemTitle={item.title}
                            tasks={tasksByItemId[item.id] ?? []}
                            actionId={taskActionId}
                            onCreate={(title) => addActivityTask(item, title)}
                            onToggle={toggleActivityTask}
                            onUpdate={updateActivityTaskTitle}
                            onDelete={removeActivityTask}
                          />
                        </motion.article>
                      );
                    })}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="rounded-2xl border border-[#dfe5ee] bg-white px-5 py-7 text-sm font-semibold text-[#667085] md:ml-16 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  {selectedDay.date ? 'Nenhuma atividade planejada para esta data.' : 'Nenhuma atividade cadastrada para este dia.'}
                  <button type="button" onClick={openNewItemModal} className="ml-2 font-black text-[#007c68] dark:text-emerald-300">
                    Adicionar atividade
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-[#dfe5ee] bg-white px-5 py-7 text-sm font-semibold text-[#667085] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Nenhum roteiro encontrado para esta viagem.
            </div>
          )}
        </motion.section>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-2xl border border-[#dfe5ee] bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center gap-2">
              <Route className="h-5 w-5 text-[#007c68] dark:text-emerald-300" />
              <h2 className="text-base font-semibold text-[#0b1c30] dark:text-slate-50">Resumo do dia</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="font-medium text-[#667085] dark:text-slate-300">Concluídas</dt>
                <dd className="font-black text-[#0b1c30] dark:text-slate-50">{selectedDay?.completedCount ?? 0}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="font-medium text-[#667085] dark:text-slate-300">Pendentes</dt>
                <dd className="font-black text-[#0b1c30] dark:text-slate-50">{Math.max(0, selectedDayPendingCount)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-[#667085] dark:text-slate-300">Próxima</dt>
                <dd className="min-w-0 max-w-[13rem] text-right font-black text-[#0b1c30] dark:text-slate-50">
                  {nextActivity?.title ?? 'Nenhuma atividade pendente'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-[#667085] dark:text-slate-300">Local</dt>
                <dd className="min-w-0 max-w-[13rem] text-right font-black text-[#0b1c30] dark:text-slate-50">{selectedDayLocation}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="font-medium text-[#667085] dark:text-slate-300">Tempo</dt>
                <dd className="font-black text-[#0b1c30] dark:text-slate-50">{selectedDayTimeEstimate}</dd>
              </div>
            </dl>
          </section>

          <section className="relative h-64 overflow-hidden rounded-2xl border border-[#c6c6cd] bg-[#063f43] text-white shadow-sm">
            <div
              className="absolute inset-0 opacity-80"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, rgba(72,253,211,0.24) 1px, transparent 1px), linear-gradient(45deg, rgba(255,255,255,0.12) 1px, transparent 1px), radial-gradient(circle at 60% 40%, rgba(72,253,211,0.35), transparent 24%), radial-gradient(circle at 35% 55%, rgba(255,255,255,0.18), transparent 18%)',
                backgroundSize: '18px 18px, 28px 28px, 100% 100%, 100% 100%',
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5">
              <p className="text-sm font-semibold">Localizacao Atual</p>
              <h3 className="mt-1 text-lg font-black">{currentLocation}</h3>
            </div>
          </section>

          <section className="rounded-2xl bg-[#131b2e] p-6 text-[#dce9ff] shadow-sm">
            <h2 className="text-base font-semibold text-white/80">Metricas do Dia</h2>
            <div className="mt-6 space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                  <span>Atividades concluidas</span>
                  <span>{selectedDaySummary}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-[#007c68]" style={{ width: `${selectedDayProgress}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                  <span>Roteiro geral</span>
                  <span>{itineraryProgress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-[#007c68]" style={{ width: `${itineraryProgress}%` }} />
                </div>
              </div>
            </div>
          </section>
        </aside>
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
              className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl shadow-slate-950/30 dark:border dark:border-slate-700 dark:bg-slate-900"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                  <AlertTriangle className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">Excluir atividade</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50">
                    Tem certeza que deseja excluir esta atividade?
                  </h2>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-300">
                    {itemPendingDelete.title}
                  </p>
                </div>
              </div>
              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setItemPendingDelete(null)}
                  className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
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
