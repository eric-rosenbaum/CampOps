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
import { startSupabaseHeartbeat } from '@/lib/supabase';
import { campLog } from '@/lib/campLog';
import { useIssuesStore, startIssueWriteQueue } from '@/store/issuesStore';
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

    // Start the Supabase keep-alive heartbeat.  Pings every 30 s while visible to
    // keep the TCP socket from going stale and to refresh the JWT before expiry.
    const stopHeartbeat = startSupabaseHeartbeat();
    const stopWriteQueue = startIssueWriteQueue();

    // Track when each subscription last fired a WAL event (ms since epoch, 0 = never).
    // Used to prevent both the initial load and refetchAll from overwriting a fresher
    // snapshot that the subscription already delivered after a user write.
    let issuesSyncedAt = 0;
    let tasksSyncedAt = 0;
    let poolSyncedAt = 0;
    let safetySyncedAt = 0;
    let assetsSyncedAt = 0;

    // Start subscriptions FIRST so any writes during the initial data load are captured.
    // If subscriptions were started after loading, a write that completes before the
    // subscription starts would fire a WAL event nobody is listening to, and the
    // subsequent setIssues(initialData) would overwrite the optimistic update permanently.
    unsubIssues = subscribeToIssues(campId, (issues) => { setIssues(issues); }, () => { issuesSyncedAt = Date.now(); });
    unsubTasks = subscribeToTasks(campId, (tasks) => { setTasks(tasks); }, () => { tasksSyncedAt = Date.now(); });
    unsubPool = subscribeToPool(campId, (d) => {
      setPools(d.pools);
      setChemicalReadings(d.readings);
      setEquipment(d.equipment);
      setServiceLog(d.serviceLog);
      setInspections(d.inspections);
      setInspectionLog(d.inspectionLog);
      setSeasonalTasks(d.seasonalTasks);
    }, () => { poolSyncedAt = Date.now(); });
    unsubSafety = subscribeToSafety(campId, (d) => {
      setItems(d.items);
      setSafetyLog(d.inspectionLog);
      setDrills(d.drills);
      setStaff(d.staff);
      setCertifications(d.certifications);
      setTempLogs(d.tempLogs);
      setLicenses(d.licenses);
    }, () => { safetySyncedAt = Date.now(); });
    unsubAssets = subscribeToAssets(campId, (d) => {
      setAssets(d.assets);
      setCheckouts(d.checkouts);
      setServiceRecords(d.serviceRecords);
      setMaintenanceTasks(d.maintenanceTasks);
    }, () => { assetsSyncedAt = Date.now(); });

    // Load initial data after subscriptions are live.
    // Skip each setter if the subscription already fired — the subscription's refetch
    // happened after a user write and is strictly more current than our snapshot.
    const loadStartedAt = Date.now();

    initializeSupabase(campId).then((data) => {
      if (!data) return;
      if (issuesSyncedAt <= loadStartedAt) setIssues(data.issues);
      if (tasksSyncedAt <= loadStartedAt) setTasks(data.tasks);
      if (data.season) setSeason(data.season);
    });

    loadPoolFromSupabase(campId).then((data) => {
      if (!data || poolSyncedAt > loadStartedAt) return;
      setPools(data.pools);
      setChemicalReadings(data.readings);
      setEquipment(data.equipment);
      setServiceLog(data.serviceLog);
      setInspections(data.inspections);
      setInspectionLog(data.inspectionLog);
      setSeasonalTasks(data.seasonalTasks);
    });

    loadSafetyFromSupabase(campId).then((data) => {
      if (!data || safetySyncedAt > loadStartedAt) return;
      setItems(data.items);
      setSafetyLog(data.inspectionLog);
      setDrills(data.drills);
      setStaff(data.staff);
      setCertifications(data.certifications);
      setTempLogs(data.tempLogs);
      setLicenses(data.licenses);
    });

    loadAssetsFromSupabase(campId).then((data: AssetData | null) => {
      if (!data || assetsSyncedAt > loadStartedAt) return;
      setAssets(data.assets);
      setCheckouts(data.checkouts);
      setServiceRecords(data.serviceRecords);
      setMaintenanceTasks(data.maintenanceTasks);
    });

    // Refetch after the tab has been hidden long enough that the realtime subscription
    // may have missed events (e.g. WebSocket disconnected during sleep/long absence).
    // We skip the refetch for short tab switches to avoid a race: a quick refetch can
    // overwrite an in-flight save (optimistic update) before the subscription catches it.
    const REFETCH_AFTER_HIDDEN_MS = 2 * 60 * 1000; // 2 minutes
    const PERIODIC_REFETCH_MS = 30 * 1000; // 30 seconds
    let hiddenAt: number | null = null;

    async function refetchAll(reason: string) {
      if (!campId) return;
      campLog(`[CampOps] refetchAll START reason=${reason} t=${Date.now()}`);
      const refetchStartedAt = Date.now();
      const [issuesData, poolData, safetyData, assetData] = await Promise.all([
        initializeSupabase(campId),
        loadPoolFromSupabase(campId),
        loadSafetyFromSupabase(campId),
        loadAssetsFromSupabase(campId),
      ]);
      const applied: string[] = [];
      if (issuesData && issuesSyncedAt <= refetchStartedAt) { setIssues(issuesData.issues); setTasks(issuesData.tasks); if (issuesData.season) setSeason(issuesData.season); applied.push('issues'); }
      if (poolData && poolSyncedAt <= refetchStartedAt) { setPools(poolData.pools); setChemicalReadings(poolData.readings); setEquipment(poolData.equipment); setServiceLog(poolData.serviceLog); setInspections(poolData.inspections); setInspectionLog(poolData.inspectionLog); setSeasonalTasks(poolData.seasonalTasks); applied.push('pool'); }
      if (safetyData && safetySyncedAt <= refetchStartedAt) { setItems(safetyData.items); setSafetyLog(safetyData.inspectionLog); setDrills(safetyData.drills); setStaff(safetyData.staff); setCertifications(safetyData.certifications); setTempLogs(safetyData.tempLogs); setLicenses(safetyData.licenses); applied.push('safety'); }
      if (assetData && assetsSyncedAt <= refetchStartedAt) { setAssets(assetData.assets); setCheckouts(assetData.checkouts); setServiceRecords(assetData.serviceRecords); setMaintenanceTasks(assetData.maintenanceTasks); applied.push('assets'); }
      campLog(`[CampOps] refetchAll DONE applied=${applied.join(',') || 'none(WAL-guard)'} syncedAts=issues:${issuesSyncedAt} pool:${poolSyncedAt} safety:${safetySyncedAt} assets:${assetsSyncedAt} refetchStartedAt:${refetchStartedAt}`);
    }

    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        campLog('[CampOps] tab hidden');
      } else if (document.visibilityState === 'visible' && hiddenAt !== null) {
        const hiddenMs = Date.now() - hiddenAt;
        hiddenAt = null;
        campLog(`[CampOps] tab visible after ${Math.round(hiddenMs / 1000)}s hidden`);
        if (hiddenMs >= REFETCH_AFTER_HIDDEN_MS) {
          campLog('[CampOps] scheduling refetchAll in 5s (was hidden long enough)');
          setTimeout(() => refetchAll('visibility'), 5000);
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    // Chrome Page Lifecycle: fires when a frozen tab is resumed.
    // visibilitychange does NOT fire reliably in this case.
    function handleResume() {
      campLog('[CampOps] page RESUMED from freeze — scheduling refetchAll in 15s');
      setTimeout(() => refetchAll('resume'), 15000);
    }
    // pageshow fires when page is restored from bfcache (back/forward navigation).
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        campLog('[CampOps] page restored from bfcache — scheduling refetchAll in 15s');
        setTimeout(() => refetchAll('pageshow'), 15000);
      }
    }
    document.addEventListener('resume', handleResume);
    window.addEventListener('pageshow', handlePageShow);

    // Periodic safety net: even if the tab was never hidden, the WebSocket can
    // drop silently (network hiccup, router reconnect). Poll every 3 minutes so
    // any write whose WAL event was missed shows up within that window.
    const periodicTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        campLog('[CampOps] periodic refetchAll');
        refetchAll('periodic');
      }
    }, PERIODIC_REFETCH_MS);

    return () => {
      unsubIssues?.();
      unsubTasks?.();
      unsubPool?.();
      unsubSafety?.();
      unsubAssets?.();
      stopHeartbeat();
      stopWriteQueue();
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('resume', handleResume);
      window.removeEventListener('pageshow', handlePageShow);
      clearInterval(periodicTimer);
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
