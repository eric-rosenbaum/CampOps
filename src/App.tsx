import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { MyTasks } from '@/pages/MyTasks';
import { IssuesRepairs } from '@/pages/IssuesRepairs';
import { PrePostCamp } from '@/pages/PrePostCamp';
import { initializeSupabase, subscribeToIssues, subscribeToTasks } from '@/lib/db';
import { useIssuesStore } from '@/store/issuesStore';
import { useChecklistStore } from '@/store/checklistStore';

function AppInit() {
  const setIssues = useIssuesStore((s) => s.setIssues);
  const setTasks = useChecklistStore((s) => s.setTasks);
  const setSeason = useChecklistStore((s) => s.setSeason);

  useEffect(() => {
    let unsubIssues: (() => void) | null = null;
    let unsubTasks: (() => void) | null = null;

    initializeSupabase().then((data) => {
      if (!data) return; // Supabase unavailable or returned empty — keep in-memory seed data
      setIssues(data.issues);
      setTasks(data.tasks);
      if (data.season) setSeason(data.season);

      unsubIssues = subscribeToIssues(setIssues);
      unsubTasks = subscribeToTasks(setTasks);
    });

    return () => {
      unsubIssues?.();
      unsubTasks?.();
    };
  }, [setIssues, setTasks, setSeason]);

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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
