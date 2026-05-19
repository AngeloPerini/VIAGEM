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

export type CountryId = 'italy' | 'switzerland' | 'france' | 'international';

export type CountryFilterId = CountryId | 'all';

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

export type TravelGroup = {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
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
