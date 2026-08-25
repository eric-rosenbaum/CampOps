import { useMemo } from 'react';
import { useLocationStore } from '@/store/locationStore';
import type { CampLocation, BuildingDetail } from '@/lib/types';

// The Building Systems module composes its "buildings" from the unified locations
// tree: a building is a top-level location and its rooms are that location's child
// nodes. These hooks/selectors bridge the locationStore into the building UI.

/**
 * Every building the camp has, which means every top-level location.
 *
 * This used to also require a `building_details` row, which made the module quietly lie: a
 * building added under Camp Info showed up everywhere else in the app but was missing here,
 * rooms and all, until somebody happened to record a shutoff location against it. Camp Info
 * owns the list of buildings; `building_details` is the systems metadata hung off one, so it
 * describes a building rather than deciding whether there is one.
 */
export function useBuildings(): CampLocation[] {
  const locations = useLocationStore((s) => s.locations);
  return useMemo(
    () => locations
      .filter((l) => l.parentId == null && l.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [locations],
  );
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
