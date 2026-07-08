import { useAsync } from "./useAsync";
import { listPeople } from "./people";
import { listPlaces } from "./places";
import type { PersonDTO, PlaceDTO } from "@shared/dto";

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
      places ? listPlaces() : Promise.resolve(null),
      people ? listPeople() : Promise.resolve(null),
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
