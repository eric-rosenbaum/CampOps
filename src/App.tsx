import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ProtectedRoute, CampRoute, PlatformAdminRoute, NoCampAccess } from '@/components/auth/ProtectedRoute';
import { AdminConsole } from '@/pages/admin/AdminConsole';
import { useAuthStore } from '@/store/authStore';
import { useCampStore } from '@/store/campStore';

// Public
import { PublicReportForm } from '@/pages/report/PublicReportForm';

// Auth pages
import { Login } from '@/pages/auth/Login';
import { Signup } from '@/pages/auth/Signup';
import { ForgotPassword } from '@/pages/auth/ForgotPassword';
import { ResetPassword } from '@/pages/auth/ResetPassword';
import { CampSetup } from '@/pages/auth/CampSetup';
import { JoinCamp } from '@/pages/auth/JoinCamp';
import { AcceptInvite } from '@/pages/auth/AcceptInvite';
import { AppHandoff } from '@/pages/auth/AppHandoff';
import { GetStarted } from '@/pages/auth/GetStarted';
import { TryDemo } from '@/pages/auth/TryDemo';
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
import { BuildingSystems } from '@/pages/BuildingSystems';
import { Commissary } from '@/pages/Commissary';
import { Retreats } from '@/pages/Retreats';
import { RetreatPortal } from '@/pages/portal/RetreatPortal';
import { PrivacyPolicy } from '@/pages/legal/PrivacyPolicy';
import { SecurityOverview } from '@/pages/legal/SecurityOverview';
import { Dpa } from '@/pages/legal/Dpa';
import { LandingPage } from '@/pages/LandingPage';

// My Tasks
import { MyTasks } from '@/pages/MyTasks';

// Settings
import { Team } from '@/pages/settings/Team';
import { CampSettings } from '@/pages/settings/CampSettings';
import { SecuritySettings } from '@/pages/settings/SecuritySettings';

// Data loading
import {
  initializeSupabase, subscribeToIssues, subscribeToTasks,
  loadPoolFromSupabase, subscribeToPool,
  loadSafetyFromSupabase, subscribeToSafety,
  loadAssetsFromSupabase, subscribeToAssets,
  loadBuildingFromSupabase, subscribeToBuilding,
  loadCommissaryInventory, subscribeToCommissaryInventory,
  loadCommissaryCatalog, subscribeToCommissaryCatalog,
  loadCommissaryMenu, subscribeToCommissaryMenu,
  loadCommissaryOrders, subscribeToCommissaryOrders,
  loadCommissaryProduction, subscribeToCommissaryProduction,
  loadCommissaryAllergy, subscribeToCommissaryAllergy,
  loadProductCatalog,
  type AssetData, type BuildingData,
} from '@/lib/db';
import { startSupabaseHeartbeat } from '@/lib/supabase';
import { awaitWriteQuiet, beginSnapshot, shouldApplySnapshot, loadAndApply } from '@/lib/syncGuard';
import { campLog } from '@/lib/campLog';
import { useIssuesStore, startIssueWriteQueue } from '@/store/issuesStore';
import { useChecklistStore } from '@/store/checklistStore';
import { usePoolStore } from '@/store/poolStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useAssetStore } from '@/store/assetStore';
import { useBuildingStore } from '@/store/buildingStore';
import { useCommissaryStore } from '@/store/commissaryStore';
import { loadRetreats, subscribeToRetreats } from '@/lib/retreatsDb';
import { useRetreatStore } from '@/store/retreatStore';
import { loadLocations, subscribeToLocations } from '@/lib/locationsDb';
import { useLocationStore } from '@/store/locationStore';
import { useCampStore as useCamp } from '@/store/campStore';

function HomeRouter() {
  const { currentMember } = useCampStore();
  if (currentMember?.role === 'admin') return <AdminHome />;
  if (currentMember?.role === 'viewer') return <ViewerHome />;
  return <StaffHome />;
}

// The root path, resolved by surface:
//  • App subdomain (app.campcommand.app): product front door — signed-in → /home, else /login.
//  • Marketing host (campcommand.app / www): ALWAYS the public landing page, regardless of any
//    (possibly stale) session — marketing is a public surface and must never route into the app,
//    otherwise a leftover session bounces "/" → /home → (HostGuard) → app → /login.
//  • Dev / preview (localhost, *.vercel.app): behave like a single domain.
function LandingOrHome() {
  const { session, isLoading } = useAuthStore();
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (isLoading) return null;
  if (host.startsWith('app.')) return <Navigate to={session ? '/home' : '/login'} replace />;
  if (MARKETING_HOSTS.includes(host)) return <LandingPage />;
  return session ? <Navigate to="/home" replace /> : <LandingPage />;
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
  const { setBuildings, setRooms, setComponents, setCircuits, setSeasonalTasks: setBuildingSeasonalTasks } = useBuildingStore();
  const {
    setItems: setInventoryItems, setAdjustments, setVendors, setItemVendors, setCatalog,
    setRecipes, setIngredients, setSteps, setSessions, setMenuEntries, setRetreatMenuEntries,
    setOrders, setOrderLines, setPlans, setProductionTasks, setPrepTasks,
    setCampers, setRestrictions, setCamperSessions, setRestrictionSummary,
    setCountSessions, setStorageMap, setTemplates, setTemplateEntries,
    setDietCounts, setMealEvents, setExpenses,
    setCourses, setSubstitutions, setFiles,
  } = useCommissaryStore();
  const {
    setRetreats, setSpaces, setHousing, setHousingVersions, setDocuments: setRetreatDocs,
    setMeals: setRetreatMeals, setChangeRequests, setCosts: setRetreatCosts, setCharges, setPayments,
    setIssues: setRetreatIssues, setChecklist, setScheduleItems, setFeedback, setReminders, setInvoices,
  } = useRetreatStore();
  const { setLocations, setCategories, setBuildingDetails } = useLocationStore();

  useEffect(() => {
    if (!campId) return;
    let unsubIssues: (() => void) | null = null;
    let unsubTasks: (() => void) | null = null;
    let unsubPool: (() => void) | null = null;
    let unsubSafety: (() => void) | null = null;
    let unsubAssets: (() => void) | null = null;
    let unsubBuilding: (() => void) | null = null;
    // Commissary subscribes as three independent domains rather than one. It is the
    // first module large enough that reloading everything on any WAL event hurts —
    // adjusting one item's stock should not refetch every recipe and menu chip.
    let unsubCommInventory: (() => void) | null = null;
    let unsubCommCatalog: (() => void) | null = null;
    let unsubCommMenu: (() => void) | null = null;
    let unsubCommOrders: (() => void) | null = null;
    let unsubCommProduction: (() => void) | null = null;
    let unsubCommAllergy: (() => void) | null = null;
    let unsubRetreats: (() => void) | null = null;
    let unsubLocations: (() => void) | null = null;

    // Start the Supabase keep-alive heartbeat.  Pings every 30 s while visible to
    // keep the TCP socket from going stale and to refresh the JWT before expiry.
    const stopHeartbeat = startSupabaseHeartbeat();
    const stopWriteQueue = startIssueWriteQueue();

    // Ordering between the initial load, the realtime reloads and refetchAll is handled
    // centrally by lib/syncGuard: every read takes a per-domain token first and is dropped
    // on arrival if a newer read for that domain already landed, and every read waits for
    // in-flight writes to settle. That replaces the old "syncedAt vs loadStartedAt"
    // timestamps, which could not tell a stale snapshot from a fresh one and so let a
    // reload started mid-save overwrite an optimistic update.
    //
    // The apply callbacks below are the single place each domain's slices are written.
    const applyPool = (d: NonNullable<Awaited<ReturnType<typeof loadPoolFromSupabase>>>) => {
      setPools(d.pools);
      setChemicalReadings(d.readings);
      setEquipment(d.equipment);
      setServiceLog(d.serviceLog);
      setInspections(d.inspections);
      setInspectionLog(d.inspectionLog);
      setSeasonalTasks(d.seasonalTasks);
    };
    const applySafety = (d: NonNullable<Awaited<ReturnType<typeof loadSafetyFromSupabase>>>) => {
      setItems(d.items);
      setSafetyLog(d.inspectionLog);
      setDrills(d.drills);
      setStaff(d.staff);
      setCertifications(d.certifications);
      setTempLogs(d.tempLogs);
      setLicenses(d.licenses);
    };
    const applyAssets = (d: AssetData) => {
      setAssets(d.assets);
      setCheckouts(d.checkouts);
      setServiceRecords(d.serviceRecords);
      setMaintenanceTasks(d.maintenanceTasks);
    };
    const applyBuilding = (d: BuildingData) => {
      setBuildings(d.buildings);
      setRooms(d.rooms);
      setComponents(d.components);
      setCircuits(d.circuits);
      setBuildingSeasonalTasks(d.seasonalTasks);
    };
    const applyCommInventory = (d: NonNullable<Awaited<ReturnType<typeof loadCommissaryInventory>>>) => {
      setInventoryItems(d.items);
      setAdjustments(d.adjustments);
      setVendors(d.vendors);
      setItemVendors(d.itemVendors);
      setCountSessions(d.countSessions);
      setStorageMap(d.storageMap);
    };
    const applyCommCatalog = (d: NonNullable<Awaited<ReturnType<typeof loadCommissaryCatalog>>>) => {
      setRecipes(d.recipes);
      setIngredients(d.ingredients);
      setSteps(d.steps);
    };
    const applyCommMenu = (d: NonNullable<Awaited<ReturnType<typeof loadCommissaryMenu>>>) => {
      setSessions(d.sessions);
      setMenuEntries(d.menuEntries);
      setRetreatMenuEntries(d.retreatMenuEntries);
      setTemplates(d.templates);
      setTemplateEntries(d.templateEntries);
      setDietCounts(d.dietCounts);
      setMealEvents(d.mealEvents);
      setCourses(d.courses);
      setSubstitutions(d.substitutions);
    };
    const applyCommOrders = (d: NonNullable<Awaited<ReturnType<typeof loadCommissaryOrders>>>) => {
      setOrders(d.orders);
      setOrderLines(d.orderLines);
      setExpenses(d.expenses);
    };
    const applyCommProduction = (d: NonNullable<Awaited<ReturnType<typeof loadCommissaryProduction>>>) => {
      setPlans(d.plans);
      setProductionTasks(d.productionTasks);
      setPrepTasks(d.prepTasks);
    };
    const applyCommAllergy = (d: NonNullable<Awaited<ReturnType<typeof loadCommissaryAllergy>>>) => {
      setCampers(d.campers);
      setRestrictions(d.restrictions);
      setCamperSessions(d.camperSessions);
      setRestrictionSummary(d.summary);
      setFiles(d.files);
    };

    // Start subscriptions FIRST so any writes during the initial data load are captured.
    // If subscriptions were started after loading, a write that completes before the
    // subscription starts would fire a WAL event nobody is listening to, and the
    // subsequent setIssues(initialData) would overwrite the optimistic update permanently.
    unsubIssues = subscribeToIssues(campId, setIssues);
    unsubTasks = subscribeToTasks(campId, setTasks);
    unsubPool = subscribeToPool(campId, applyPool);
    unsubSafety = subscribeToSafety(campId, applySafety);
    unsubAssets = subscribeToAssets(campId, applyAssets);
    unsubBuilding = subscribeToBuilding(campId, applyBuilding);
    unsubCommInventory = subscribeToCommissaryInventory(campId, applyCommInventory);
    unsubCommCatalog = subscribeToCommissaryCatalog(campId, applyCommCatalog);
    unsubCommMenu = subscribeToCommissaryMenu(campId, applyCommMenu);
    unsubCommOrders = subscribeToCommissaryOrders(campId, applyCommOrders);
    unsubCommProduction = subscribeToCommissaryProduction(campId, applyCommProduction);
    unsubCommAllergy = subscribeToCommissaryAllergy(campId, applyCommAllergy);

    // Retreats — one low-volume domain (a handful of retreats per camp).
    const applyRetreatData = (d: import('@/lib/retreatsDb').RetreatData) => {
      setRetreats(d.retreats); setSpaces(d.spaces); setHousing(d.housing); setHousingVersions(d.housingVersions);
      setRetreatDocs(d.documents); setRetreatMeals(d.meals); setChangeRequests(d.changeRequests);
      setRetreatCosts(d.costs); setCharges(d.charges); setPayments(d.payments); setRetreatIssues(d.issues);
      setChecklist(d.checklist); setScheduleItems(d.scheduleItems); setFeedback(d.feedback); setReminders(d.reminders);
      setInvoices(d.invoices);
    };
    unsubRetreats = subscribeToRetreats(campId, applyRetreatData);

    // Unified locations tree (camp-wide reference data).
    const applyLocationData = (d: import('@/lib/locationsDb').LocationData) => {
      setLocations(d.locations); setCategories(d.categories); setBuildingDetails(d.buildingDetails);
    };
    unsubLocations = subscribeToLocations(campId, applyLocationData);

    // Load initial data after subscriptions are live. Each load goes through the sync
    // guard, so a subscription reload that lands first is never overwritten by this
    // (older) snapshot.
    // Issues and tasks share one loader but are two sync-guard domains, so each gets its
    // own token rather than going through loadAndApply twice (which would fetch twice).
    const loadIssuesAndTasks = async (): Promise<boolean> => {
      await awaitWriteQuiet();
      const issuesToken = beginSnapshot('issues');
      const tasksToken = beginSnapshot('tasks');
      const data = await initializeSupabase(campId);
      if (!data) return false;
      let applied = false;
      if (shouldApplySnapshot('issues', issuesToken)) { setIssues(data.issues); applied = true; }
      if (shouldApplySnapshot('tasks', tasksToken)) { setTasks(data.tasks); applied = true; }
      if (data.season) setSeason(data.season);
      return applied;
    };

    loadIssuesAndTasks();
    loadAndApply('pool', () => loadPoolFromSupabase(campId), applyPool);
    loadAndApply('safety', () => loadSafetyFromSupabase(campId), applySafety);
    loadAndApply('assets', () => loadAssetsFromSupabase(campId), applyAssets);
    loadAndApply('building', () => loadBuildingFromSupabase(campId), applyBuilding);

    // Global shared catalog — not camp-scoped, loaded once (no realtime channel).
    loadProductCatalog().then((rows) => { if (rows) setCatalog(rows); });

    loadAndApply('commissary-inventory', () => loadCommissaryInventory(campId), applyCommInventory);
    loadAndApply('commissary-catalog', () => loadCommissaryCatalog(campId), applyCommCatalog);
    loadAndApply('commissary-menu', () => loadCommissaryMenu(campId), applyCommMenu);
    loadAndApply('commissary-orders', () => loadCommissaryOrders(campId), applyCommOrders);
    loadAndApply('commissary-production', () => loadCommissaryProduction(campId), applyCommProduction);
    // For members without camper health access, campers/restrictions come back empty by
    // RLS design and only `summary` is populated. That is not an error state.
    loadAndApply('commissary-allergy', () => loadCommissaryAllergy(campId), applyCommAllergy);
    loadAndApply('retreats', () => loadRetreats(campId), applyRetreatData);
    loadAndApply('locations', () => loadLocations(campId), applyLocationData);

    // Refetch after the tab has been hidden long enough that the realtime subscription
    // may have missed events (e.g. WebSocket disconnected during sleep/long absence).
    // We skip the refetch for short tab switches to avoid a race: a quick refetch can
    // overwrite an in-flight save (optimistic update) before the subscription catches it.
    const REFETCH_AFTER_HIDDEN_MS = 2 * 60 * 1000; // 2 minutes
    const PERIODIC_REFETCH_MS = 3 * 60 * 1000; // 3 minutes
    let hiddenAt: number | null = null;

    // A safety net, not the primary sync path — realtime is. Every domain goes through
    // the sync guard, so a refetch that raced a save is dropped instead of applied.
    async function refetchAll(reason: string) {
      if (!campId) return;
      campLog(`[CampOps] refetchAll START reason=${reason} t=${Date.now()}`);
      const results = await Promise.all([
        loadIssuesAndTasks().then((ok) => ok && 'issues'),
        loadAndApply('pool', () => loadPoolFromSupabase(campId), applyPool).then((ok) => ok && 'pool'),
        loadAndApply('safety', () => loadSafetyFromSupabase(campId), applySafety).then((ok) => ok && 'safety'),
        loadAndApply('assets', () => loadAssetsFromSupabase(campId), applyAssets).then((ok) => ok && 'assets'),
        loadAndApply('building', () => loadBuildingFromSupabase(campId), applyBuilding).then((ok) => ok && 'building'),
        loadAndApply('commissary-inventory', () => loadCommissaryInventory(campId), applyCommInventory).then((ok) => ok && 'comm-inventory'),
        loadAndApply('commissary-catalog', () => loadCommissaryCatalog(campId), applyCommCatalog).then((ok) => ok && 'comm-catalog'),
        loadAndApply('commissary-menu', () => loadCommissaryMenu(campId), applyCommMenu).then((ok) => ok && 'comm-menu'),
        loadAndApply('commissary-orders', () => loadCommissaryOrders(campId), applyCommOrders).then((ok) => ok && 'comm-orders'),
        loadAndApply('commissary-production', () => loadCommissaryProduction(campId), applyCommProduction).then((ok) => ok && 'comm-production'),
        loadAndApply('commissary-allergy', () => loadCommissaryAllergy(campId), applyCommAllergy).then((ok) => ok && 'comm-allergy'),
        loadAndApply('retreats', () => loadRetreats(campId), applyRetreatData).then((ok) => ok && 'retreats'),
        loadAndApply('locations', () => loadLocations(campId), applyLocationData).then((ok) => ok && 'locations'),
      ]);
      const applied = results.filter(Boolean);
      campLog(`[CampOps] refetchAll DONE applied=${applied.join(',') || 'none(sync-guard)'}`);
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
      unsubBuilding?.();
      unsubCommInventory?.();
      unsubCommCatalog?.();
      unsubCommMenu?.();
      unsubCommOrders?.();
      unsubCommProduction?.();
      unsubCommAllergy?.();
      unsubRetreats?.();
      unsubLocations?.();
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

// Keep the marketing host (campcommand.app / www) to public pages only; the product — login
// and every authenticated route — lives on app.campcommand.app. Any app route requested on the
// marketing host is redirected to the app subdomain. Non-marketing hosts (app.*, localhost,
// Vercel previews) are unrestricted so dev/preview keep working.
const MARKETING_HOSTS = ['campcommand.app', 'www.campcommand.app'];
const APP_HOST = 'app.campcommand.app';
function isPublicMarketingPath(p: string): boolean {
  return p === '/' || p === '/privacy' || p === '/security' || p === '/dpa'
    || p.startsWith('/portal/') || p.startsWith('/report/');
}
function HostGuard() {
  const loc = useLocation();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!MARKETING_HOSTS.includes(window.location.hostname)) return;
    if (!isPublicMarketingPath(loc.pathname)) {
      window.location.href = `https://${APP_HOST}${loc.pathname}${loc.search}`;
    }
  }, [loc.pathname, loc.search]);
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
        <HostGuard />
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingOrHome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/signup" element={<Signup />} />
          {/* The link to hand someone who asks how to get in, on any platform. */}
          <Route path="/get-started" element={<GetStarted />} />
          <Route path="/invite/:token" element={<AcceptInvite />} />
          <Route path="/try/:token" element={<TryDemo />} />

          {/* Public — handles auth inline */}
          <Route path="/join" element={<JoinCamp />} />
          <Route path="/report/:camp" element={<PublicReportForm />} />
          <Route path="/portal/:token" element={<RetreatPortal />} />

          {/* Public legal / trust pages */}
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/security" element={<SecurityOverview />} />
          <Route path="/dpa" element={<Dpa />} />

          {/* Authenticated — no camp required */}
          <Route element={<ProtectedRoute />}>
            <Route path="/no-access" element={<NoCampAccess />} />
            {/* Post-join iOS app handoff. Redirects to /home when it doesn't apply. */}
            <Route path="/welcome" element={<AppHandoff />} />

            {/* Founder super-admin only: the admin console + direct camp setup */}
            <Route element={<PlatformAdminRoute />}>
              <Route path="/admin" element={<AdminConsole />} />
              <Route path="/setup" element={<CampSetup />} />
            </Route>

            {/* Authenticated + camp required, full-screen */}
            <Route element={<CampRoute />}>
              <Route path="/onboarding" element={<Onboarding />} />
            </Route>

            {/* Authenticated + camp required */}
            <Route element={<CampRoute />}>
              <Route element={<><CampDataLoader /><Layout /></>}>
                <Route path="/home" element={<HomeRouter />} />
                <Route path="/my-tasks" element={<MyTasks />} />
                <Route path="/issues" element={<IssuesRepairs />} />
                <Route path="/pre-post" element={<PrePostCamp />} />
                <Route path="/pool" element={<PoolManagement />} />
                <Route path="/safety" element={<SafetyCompliance />} />
                <Route path="/assets" element={<AssetVehicles />} />
                <Route path="/building" element={<BuildingSystems />} />
                <Route path="/commissary" element={<Commissary />} />
                <Route path="/retreats" element={<Retreats />} />
                <Route path="/settings" element={<CampSettings />} />
                <Route path="/settings/team" element={<Team />} />
                <Route path="/settings/security" element={<SecuritySettings />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppBootstrap>
    </BrowserRouter>
  );
}
