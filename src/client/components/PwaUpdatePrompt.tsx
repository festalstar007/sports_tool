import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function PwaUpdatePrompt() {
  const updateSW = useRef<ReturnType<typeof registerSW> | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    updateSW.current = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        if (active) setAvailable(true);
      },
      onNeedReload: () => window.location.reload(),
    });
    return () => { active = false; };
  }, []);

  if (!available) return null;

  return (
    <aside className="pwa-update-prompt" role="status" aria-live="polite">
      <div>
        <strong>发现新版本</strong>
        <p>不会自动刷新，完成当前录入后再更新即可。</p>
      </div>
      <div className="pwa-update-actions">
        <button type="button" className="text-button" onClick={() => setAvailable(false)}>稍后</button>
        <button type="button" className="primary-button" onClick={() => void updateSW.current?.(true)}>立即更新</button>
      </div>
    </aside>
  );
}
