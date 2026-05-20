export type CurrencyRange = {
  min: number;
  max: number;
};

export type LinkItem = {
  label: string;
  url: string;
};

export type Expense = {
  id: string;
  category: string;
  country?: CountryId;
  title: string;
  detail?: string;
  euro: CurrencyRange;
  real: CurrencyRange;
  links?: LinkItem[];
};

export type CategoryMeta = {
  id: string;
  name: string;
  label: string;
  accent: string;
};

export type CurrencyQuote = {
  bid: number;
  pctChange: number;
  timestamp: number;
};

export type QuoteHistoryPoint = {
  rate: number;
  timestamp: number;
};

export type RealValueMode = 'original' | 'converted';

export type CountryId = string;

export type CountryFilterId = string;

export type CountryMeta = {
  id: CountryFilterId;
  name: string;
  shortName: string;
  accent: string;
};

export type ItineraryType =
  | 'arrival'
  | 'lodging'
  | 'tour'
  | 'transport'
  | 'food'
  | 'flight'
  | 'train'
  | 'motorhome'
  | 'shopping'
  | 'document'
  | 'rest'
  | 'other';

export type ItineraryItem = {
  id: string;
  day: string;
  country: CountryId;
  city: string;
  time: string;
  title: string;
  description: string;
  type: ItineraryType;
  completed?: boolean;
  links?: LinkItem[];
};

export type Attraction = {
  id: string;
  name: string;
  country: CountryId;
  city: string;
  day: string;
  time?: string;
  description: string;
  links?: LinkItem[];
};

export type AttractionState = {
  visited: boolean;
  photo?: string;
  updatedAt?: number;
};

export type AttractionStateMap = Record<string, AttractionState>;

export type GroupRole = 'owner' | 'member';
export type TripStatus = 'planned' | 'active' | 'completed' | 'canceled';

export type TravelGroup = {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  status?: TripStatus;
  countries?: string[];
  startDate?: string;
  endDate?: string;
  travelStyle?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type UserTravelGroup = TravelGroup & {
  role: GroupRole;
};

export type GroupMember = {
  id: string;
  groupId: string;
  userId: string;
  role: GroupRole;
  createdAt?: string;
};

export type UserProfile = {
  id: string;
  email?: string;
  fullName?: string;
  avatarUrl?: string;
  aiGenerationsUsed?: number;
  aiGenerationsLimit?: number;
  lastAiGenerationAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type GroupMemberProfile = GroupMember & {
  profile?: UserProfile | null;
};

export type UserStats = {
  countriesCount: number;
  travelCount: number;
  hasActiveTrip: boolean;
  totalAllReal: CurrencyRange;
  totalAllEuro: CurrencyRange;
  totalActiveReal: CurrencyRange;
  totalActiveEuro: CurrencyRange;
};

export type TripSummary = {
  groupId: string;
  totalReal: CurrencyRange;
  totalEuro: CurrencyRange;
  participantsCount: number;
  visitedAttractionsCount: number;
};

export type CreateTravelGroupInput = {
  name: string;
  description?: string;
  countries?: string[];
  startDate?: string;
  endDate?: string;
  travelStyle?: string;
  notes?: string;
};

export type TripStyle = 'economica' | 'intermediaria' | 'confortavel';

export type TripAIInput = {
  tripName: string;
  countries: string[];
  description: string;
  startDate: string;
  endDate: string;
  style: TripStyle;
  groupId: string;
};

export type TripAIDocument = {
  title: string;
  detail: string;
};

export type TripAIRoute = {
  from: string;
  to: string;
  transport: string;
  duration?: string;
  estimatedCost?: string;
  notes?: string;
};

export type TripAIPlan = {
  generationId?: string;
  summary: string;
  documents: TripAIDocument[];
  routes: TripAIRoute[];
  itinerary_items: ItineraryItem[];
  expenses: Expense[];
  attractions: Attraction[];
  warnings: string[];
};

export type TripAIReviewState = {
  group: UserTravelGroup;
  input: TripAIInput;
  plan: TripAIPlan;
  createdAt: number;
};
