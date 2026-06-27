import { useBuildingStore } from '@/store/buildingStore';
import type { BuildingComponent } from '@/lib/types';

// Navigate from a cross-building tab into the building drilldown with the
// component selected.
export function useJumpToComponent() {
  const { setActiveTab, setActiveBuilding, setActiveComponent } = useBuildingStore();
  return (c: BuildingComponent) => {
    setActiveTab('buildings');
    setActiveBuilding(c.buildingId);
    setActiveComponent(c.id);
  };
}
