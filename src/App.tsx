import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { MyTasks } from '@/pages/MyTasks';
import { IssuesRepairs } from '@/pages/IssuesRepairs';
import { PrePostCamp } from '@/pages/PrePostCamp';
import { PoolManagement } from '@/pages/PoolManagement';
import { SafetyCompliance } from '@/pages/SafetyCompliance';
import { initializeSupabase, subscribeToIssues, subscribeToTasks, loadPoolFromSupabase, subscribeToPool, loadSafetyFromSupabase, subscribeToSafety } from '@/lib/db';
import { useIssuesStore } from '@/store/issuesStore';
import { useChecklistStore } from '@/store/checklistStore';
import { usePoolStore } from '@/store/poolStore';
import { useSafetyStore } from '@/store/safetyStore';

function AppInit() {
  const setIssues = useIssuesStore((s) => s.setIssues);
  const setTasks = useChecklistStore((s) => s.setTasks);
  const setSeason = useChecklistStore((s) => s.setSeason);
  const { setChemicalReadings, setEquipment, setServiceLog, setInspections, setInspectionLog, setSeasonalTasks } = usePoolStore();
  const { setItems, setInspectionLog: setSafetyLog, setDrills, setStaff, setCertifications, setTempLogs } = useSafetyStore();

  useEffect(() => {
    let unsubIssues: (() => void) | null = null;
    let unsubTasks: (() => void) | null = null;
    let unsubPool: (() => void) | null = null;
    let unsubSafety: (() => void) | null = null;

    initializeSupabase().then((data) => {
      if (!data) {
        console.warn('[App] Supabase unavailable — stores remain empty');
        return;
      }
      console.log('[App] Supabase data received:', data.issues.length, 'issues,', data.tasks.length, 'tasks');
      setIssues(data.issues);
      setTasks(data.tasks);
      if (data.season) setSeason(data.season);

      unsubIssues = subscribeToIssues(setIssues);
      unsubTasks = subscribeToTasks(setTasks);
    });

    loadPoolFromSupabase().then((data) => {
      if (!data) return;
      setChemicalReadings(data.readings);
      setEquipment(data.equipment);
      setServiceLog(data.serviceLog);
      setInspections(data.inspections);
      setInspectionLog(data.inspectionLog);
      setSeasonalTasks(data.seasonalTasks);

      unsubPool = subscribeToPool((d) => {
        setChemicalReadings(d.readings);
        setEquipment(d.equipment);
        setServiceLog(d.serviceLog);
        setInspections(d.inspections);
        setInspectionLog(d.inspectionLog);
        setSeasonalTasks(d.seasonalTasks);
      });
    });

    loadSafetyFromSupabase().then((data) => {
      if (!data) return;
      setItems(data.items);
      setSafetyLog(data.inspectionLog);
      setDrills(data.drills);
      setStaff(data.staff);
      setCertifications(data.certifications);
      setTempLogs(data.tempLogs);

      unsubSafety = subscribeToSafety((d) => {
        setItems(d.items);
        setSafetyLog(d.inspectionLog);
        setDrills(d.drills);
        setStaff(d.staff);
        setCertifications(d.certifications);
        setTempLogs(d.tempLogs);
      });
    });

    return () => {
      unsubIssues?.();
      unsubTasks?.();
      unsubPool?.();
      unsubSafety?.();
    };
  }, [setIssues, setTasks, setSeason, setChemicalReadings, setEquipment, setServiceLog, setInspections, setInspectionLog, setSeasonalTasks, setItems, setSafetyLog, setDrills, setStaff, setCertifications, setTempLogs]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInit />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/my-tasks" element={<MyTasks />} />
          <Route path="/issues" element={<IssuesRepairs />} />
          <Route path="/pre-post" element={<PrePostCamp />} />
          <Route path="/pool" element={<PoolManagement />} />
          <Route path="/safety" element={<SafetyCompliance />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
