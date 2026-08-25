import { useMemo } from 'react';
import { useLocationStore } from '@/store/locationStore';
import type { CampLocation, BuildingDetail } from '@/lib/types';

// The Building Systems module composes its "buildings" from the unified locations
// tree: a building is a top-level location that also has a building_details row;
// its rooms are that location's child nodes. These hooks/selectors bridge the
// locationStore into the building UI.

/** Top-level locations that have a building_details row. The buildings list. */
export function useBuildings(): CampLocation[] {
  const locations = useLocationStore((s) => s.locations);
  const buildingDetails = useLocationStore((s) => s.buildingDetails);
  return useMemo(() => {
    const structureIds = new Set(buildingDetails.map((b) => b.locationId));
    return locations
      .filter((l) => l.parentId == null && structureIds.has(l.id))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [locations, buildingDetails]);
}

/** A building's rooms = its child location nodes. */
export function useRooms(buildingLocationId: string): CampLocation[] {
  const locations = useLocationStore((s) => s.locations);
  return useMemo(
    () => locations
      .filter((l) => l.parentId === buildingLocationId)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [locations, buildingLocationId],
  );
}

export function useBuildingDetail(locationId: string | null | undefined): BuildingDetail | undefined {
  return useLocationStore((s) => (locationId ? s.buildingDetails.find((b) => b.locationId === locationId) : undefined));
}

/**
 * The building (top-level) location a component lives under. A component's
 * locationId points at either the building node itself or one of its rooms.
 */
export function buildingLocationFor(locationId: string): CampLocation | undefined {
  const s = useLocationStore.getState();
  const loc = s.locationById(locationId);
  if (!loc) return undefined;
  return loc.parentId ? s.locationById(loc.parentId) : loc;
}
