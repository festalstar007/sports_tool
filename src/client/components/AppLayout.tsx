import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';

const titles: Record<string, string> = {
  '/': '今日运动',
  '/activities': '运动记录',
  '/activities/new': '手动录入',
  '/trends': '趋势分析',
};

export function AppLayout() {
  const location = useLocation();
  const title = titles[location.pathname] ?? (location.pathname.includes('/review') ? '确认运动' : location.pathname.includes('/activities/') ? '运动详情' : 'sports_tool');

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">S</div>
        <div>
          <p>sports_tool</p>
          <h1>{title}</h1>
        </div>
      </header>
      <main className="page-content">
        <Outlet />
      </main>
      <PwaUpdatePrompt />
      <nav className="bottom-nav" aria-label="主要导航">
        <NavLink to="/" end>
          <span aria-hidden="true">＋</span>
          记录
        </NavLink>
        <NavLink to="/activities">
          <span aria-hidden="true">≡</span>
          历史
        </NavLink>
        <NavLink to="/trends">
          <span aria-hidden="true">⌁</span>
          趋势
        </NavLink>
      </nav>
    </div>
  );
}
