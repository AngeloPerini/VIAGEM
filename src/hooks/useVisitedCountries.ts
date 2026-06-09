import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeCountryCode } from '../data/countries';
import { supabase } from '../services/supabaseClient';
import { getUserVisitedCountries, subscribeUserVisitedCountries } from '../services/visitedCountriesService';
import type { VisitedCountry } from '../types';
import { useAuth } from '../contexts/AuthContext';

const WORLD_COUNTRY_TOTAL = 195;

const getPercent = (count: number) => Math.round((count / WORLD_COUNTRY_TOTAL) * 100);

const getVisitedList = (countries: VisitedCountry[]) => {
  const byCountry = new Map<string, VisitedCountry>();

  countries
    .filter((country) => country.visited)
    .sort((a, b) =>
      new Date(b.visitedAt ?? b.updatedAt ?? 0).getTime() -
      new Date(a.visitedAt ?? a.updatedAt ?? 0).getTime(),
    )
    .forEach((country) => {
      const countryCode = normalizeCountryCode(country.countryCode);
      if (!byCountry.has(countryCode)) byCountry.set(countryCode, country);
    });

  return [...byCountry.values()];
};

export function useVisitedCountries() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [visitedCountries, setVisitedCountries] = useState<VisitedCountry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!userId) {
      setVisitedCountries([]);
      setError(null);
      setIsLoading(false);
      return [];
    }

    setIsLoading(true);
    try {
      const nextVisitedCountries = await getUserVisitedCountries();
      setVisitedCountries(nextVisitedCountries);
      setError(null);
      return nextVisitedCountries;
    } catch (caughtError) {
      const message = caughtError instanceof Error
        ? caughtError.message
        : 'Nao foi possivel carregar os paises visitados.';
      setError(message);
      throw caughtError;
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refetch().catch(() => null);
  }, [refetch]);

  useEffect(() => {
    if (!userId) return undefined;

    const channel = subscribeUserVisitedCountries(userId, () => {
      void refetch().catch(() => null);
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch, userId]);

  const visitedList = useMemo(() => getVisitedList(visitedCountries), [visitedCountries]);
  const count = visitedList.length;

  return {
    visitedCountries,
    setVisitedCountries,
    visitedList,
    count,
    lastVisited: visitedList[0] ?? null,
    worldPercent: getPercent(count),
    isLoading,
    error,
    setError,
    refetch,
  };
}
