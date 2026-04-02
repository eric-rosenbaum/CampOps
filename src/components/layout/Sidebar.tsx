import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, Wrench, ClipboardList, TreePine } from 'lucide-react';

const navItems = [
  { section: 'Today', items: [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { path: '/my-tasks', label: 'My Tasks', icon: CheckSquare, end: false },
  ]},
  { section: 'Facilities', items: [
    { path: '/issues', label: 'Issues & Repairs', icon: Wrench, end: false },
    { path: '/pre-post', label: 'Pre/Post Camp', icon: ClipboardList, end: false },
  ]},
];

export function Sidebar() {
  return (
    <aside className="w-sidebar min-w-sidebar h-screen bg-forest flex flex-col flex-shrink-0 sticky top-0">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-sage rounded-btn flex items-center justify-center flex-shrink-0">
            <TreePine className="w-4 h-4 text-forest" />
          </div>
          <span className="text-[15px] font-semibold text-cream">CampOps</span>
        </div>
      </div>

      <div className="px-3 flex-1 overflow-y-auto">
        {navItems.map((section) => (
          <div key={section.section} className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-2 mb-1.5">
              {section.section}
            </p>
            {section.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-2 py-2 rounded-btn text-[13px] font-medium transition-colors mb-0.5 ${
                    isActive
                      ? 'border-l-2 border-sage bg-sage/[0.14] text-sage-light pl-[6px]'
                      : 'text-white/60 hover:text-white/90 hover:bg-white/5 border-l-2 border-transparent'
                  }`
                }
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/10">
        <p className="text-[12px] font-medium text-white/80">Pinecrest Summer Camp</p>
        <p className="text-[11px] text-white/40 mt-0.5">Jordan M. — Ops Director</p>
      </div>
    </aside>
  );
}
