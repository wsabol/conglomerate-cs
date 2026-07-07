import { useAsync } from "./useAsync";
import { apiFetch } from "./api";
import type { PersonDTO, PlaceDTO } from "@shared/dto";
import type { ListResult } from "@shared/types";

export interface FilterOptionsConfig {
  places?: boolean;
  people?: boolean;
}

export interface FilterOptions {
  places: PlaceDTO[];
  people: PersonDTO[];
  loading: boolean;
  error: Error | null;
}

/** Fetch place and/or people lists for filter dropdowns. */
export function useFilterOptions(
  config: FilterOptionsConfig = {},
): FilterOptions {
  const { places = false, people = false } = config;

  const { data, error, loading } = useAsync(async () => {
    const [placesResult, peopleResult] = await Promise.all([
      places
        ? apiFetch<ListResult<PlaceDTO>>("/api/places")
        : Promise.resolve(null),
      people
        ? apiFetch<ListResult<PersonDTO>>("/api/people")
        : Promise.resolve(null),
    ]);
    return {
      places: placesResult?.results ?? [],
      people: peopleResult?.results ?? [],
    };
  }, [places, people]);

  return {
    places: data?.places ?? [],
    people: data?.people ?? [],
    loading,
    error,
  };
}
