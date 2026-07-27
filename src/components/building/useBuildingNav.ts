import { useBuildingStore } from '@/store/buildingStore';
import { buildingLocationFor } from './useBuildings';
import type { BuildingComponent } from '@/lib/types';

// Navigate from a cross-building tab into the building drilldown with the
// component selected. Resolves the component's location to its owning building node.
export function useJumpToComponent() {
  const { setActiveTab, setActiveBuilding, setActiveComponent } = useBuildingStore();
  return (c: BuildingComponent) => {
    setActiveTab('buildings');
    setActiveBuilding(buildingLocationFor(c.locationId)?.id ?? null);
    setActiveComponent(c.id);
  };
}
