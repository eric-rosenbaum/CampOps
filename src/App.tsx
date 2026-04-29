import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ProtectedRoute, CampRoute } from '@/components/auth/ProtectedRoute';
import { useAuthStore } from '@/store/authStore';
import { useCampStore } from '@/store/campStore';

// Auth pages
import { Login } from '@/pages/auth/Login';
import { Signup } from '@/pages/auth/Signup';
import { CampSetup } from '@/pages/auth/CampSetup';
import { JoinCamp } from '@/pages/auth/JoinCamp';
import { AcceptInvite } from '@/pages/auth/AcceptInvite';
import { Onboarding } from '@/pages/onboarding/Onboarding';

// Home screens
import { AdminHome } from '@/pages/home/AdminHome';
import { StaffHome } from '@/pages/home/StaffHome';
import { ViewerHome } from '@/pages/home/ViewerHome';

// Existing app pages
import { IssuesRepairs } from '@/pages/IssuesRepairs';
import { PrePostCamp } from '@/pages/PrePostCamp';
import { PoolManagement } from '@/pages/PoolManagement';
import { SafetyCompliance } from '@/pages/SafetyCompliance';
import AssetVehicles from '@/pages/AssetVehicles';

// My Tasks
import { MyTasks } from '@/pages/MyTasks';

// Settings
import { Team } from '@/pages/settings/Team';
import { CampSettings } from '@/pages/settings/CampSettings';

// Data loading
import {
  initializeSupabase, subscribeToIssues, subscribeToTasks,
  loadPoolFromSupabase, subscribeToPool,
  loadSafetyFromSupabase, subscribeToSafety,
  loadAssetsFromSupabase, subscribeToAssets,
  type AssetData,
} from '@/lib/db';
import { useIssuesStore } from '@/store/issuesStore';
import { useChecklistStore } from '@/store/checklistStore';
import { usePoolStore } from '@/store/poolStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useAssetStore } from '@/store/assetStore';
import { useCampStore as useCamp } from '@/store/campStore';

function HomeRouter() {
  const { currentMember } = useCampStore();
  if (currentMember?.role === 'admin') return <AdminHome />;
  if (currentMember?.role === 'viewer') return <ViewerHome />;
  return <StaffHome />;
}

function CampDataLoader() {
  const { currentCamp } = useCamp();
  const campId = currentCamp?.id ?? null;

  const setIssues = useIssuesStore((s) => s.setIssues);
  const setTasks = useChecklistStore((s) => s.setTasks);
  const setSeason = useChecklistStore((s) => s.setSeason);
  const { setPools, setChemicalReadings, setEquipment, setServiceLog, setInspections, setInspectionLog, setSeasonalTasks } = usePoolStore();
  const { setItems, setInspectionLog: setSafetyLog, setDrills, setStaff, setCertifications, setTempLogs, setLicenses } = useSafetyStore();
  const { setAssets, setCheckouts, setServiceRecords, setMaintenanceTasks } = useAssetStore();

  useEffect(() => {
    if (!campId) return;
    let unsubIssues: (() => void) | null = null;
    let unsubTasks: (() => void) | null = null;
    let unsubPool: (() => void) | null = null;
    let unsubSafety: (() => void) | null = null;
    let unsubAssets: (() => void) | null = null;

    initializeSupabase(campId).then((data) => {
      if (!data) return;
      setIssues(data.issues);
      setTasks(data.tasks);
      if (data.season) setSeason(data.season);
      unsubIssues = subscribeToIssues(campId, setIssues);
      unsubTasks = subscribeToTasks(campId, setTasks);
    });

    loadPoolFromSupabase(campId).then((data) => {
      if (!data) return;
      setPools(data.pools);
      setChemicalReadings(data.readings);
      setEquipment(data.equipment);
      setServiceLog(data.serviceLog);
      setInspections(data.inspections);
      setInspectionLog(data.inspectionLog);
      setSeasonalTasks(data.seasonalTasks);
      unsubPool = subscribeToPool(campId, (d) => {
        setPools(d.pools);
        setChemicalReadings(d.readings);
        setEquipment(d.equipment);
        setServiceLog(d.serviceLog);
        setInspections(d.inspections);
        setInspectionLog(d.inspectionLog);
        setSeasonalTasks(d.seasonalTasks);
      });
    });

    loadSafetyFromSupabase(campId).then((data) => {
      if (!data) return;
      setItems(data.items);
      setSafetyLog(data.inspectionLog);
      setDrills(data.drills);
      setStaff(data.staff);
      setCertifications(data.certifications);
      setTempLogs(data.tempLogs);
      setLicenses(data.licenses);
      unsubSafety = subscribeToSafety(campId, (d) => {
        setItems(d.items);
        setSafetyLog(d.inspectionLog);
        setDrills(d.drills);
        setStaff(d.staff);
        setCertifications(d.certifications);
        setTempLogs(d.tempLogs);
        setLicenses(d.licenses);
      });
    });

    loadAssetsFromSupabase(campId).then((data: AssetData | null) => {
      if (!data) return;
      setAssets(data.assets);
      setCheckouts(data.checkouts);
      setServiceRecords(data.serviceRecords);
      setMaintenanceTasks(data.maintenanceTasks);
      unsubAssets = subscribeToAssets(campId, (d) => {
        setAssets(d.assets);
        setCheckouts(d.checkouts);
        setServiceRecords(d.serviceRecords);
        setMaintenanceTasks(d.maintenanceTasks);
      });
    });

    // Refetch everything when the tab regains focus (catches any missed realtime events)
    async function refetchAll() {
      const [issuesData, poolData, safetyData, assetData] = await Promise.all([
        initializeSupabase(campId),
        loadPoolFromSupabase(campId),
        loadSafetyFromSupabase(campId),
        loadAssetsFromSupabase(campId),
      ]);
      if (issuesData) { setIssues(issuesData.issues); setTasks(issuesData.tasks); if (issuesData.season) setSeason(issuesData.season); }
      if (poolData) { setPools(poolData.pools); setChemicalReadings(poolData.readings); setEquipment(poolData.equipment); setServiceLog(poolData.serviceLog); setInspections(poolData.inspections); setInspectionLog(poolData.inspectionLog); setSeasonalTasks(poolData.seasonalTasks); }
      if (safetyData) { setItems(safetyData.items); setSafetyLog(safetyData.inspectionLog); setDrills(safetyData.drills); setStaff(safetyData.staff); setCertifications(safetyData.certifications); setTempLogs(safetyData.tempLogs); setLicenses(safetyData.licenses); }
      if (assetData) { setAssets(assetData.assets); setCheckouts(assetData.checkouts); setServiceRecords(assetData.serviceRecords); setMaintenanceTasks(assetData.maintenanceTasks); }
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') refetchAll();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubIssues?.();
      unsubTasks?.();
      unsubPool?.();
      unsubSafety?.();
      unsubAssets?.();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [campId]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function AppBootstrap({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);
  const loadMyCamps = useCampStore((s) => s.loadMyCamps);
  const sessionUserId = useAuthStore((s) => s.session?.user?.id ?? null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (sessionUserId) loadMyCamps();
  }, [sessionUserId, loadMyCamps]);

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppBootstrap>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/invite/:token" element={<AcceptInvite />} />

          {/* Public — handles auth inline */}
          <Route path="/join" element={<JoinCamp />} />

          {/* Authenticated — no camp required */}
          <Route element={<ProtectedRoute />}>
            <Route path="/setup" element={<CampSetup />} />

            {/* Authenticated + camp required, full-screen */}
            <Route element={<CampRoute />}>
              <Route path="/onboarding" element={<Onboarding />} />
            </Route>

            {/* Authenticated + camp required */}
            <Route element={<CampRoute />}>
              <Route element={<><CampDataLoader /><Layout /></>}>
                <Route path="/" element={<HomeRouter />} />
                <Route path="/my-tasks" element={<MyTasks />} />
                <Route path="/issues" element={<IssuesRepairs />} />
                <Route path="/pre-post" element={<PrePostCamp />} />
                <Route path="/pool" element={<PoolManagement />} />
                <Route path="/safety" element={<SafetyCompliance />} />
                <Route path="/assets" element={<AssetVehicles />} />
                <Route path="/settings" element={<CampSettings />} />
                <Route path="/settings/team" element={<Team />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppBootstrap>
    </BrowserRouter>
  );
}
