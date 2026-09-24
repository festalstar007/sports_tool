import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SportType } from '../../shared/activity-schema';
import { createActivity } from '../api';
import { ActivityForm } from '../components/ActivityForm';
import { emptyActivityForm, type ActivityFormValues } from '../form';

const lastSportKey = 'sports-tool:last-manual-sport';
const manualDraftKey = 'sports-tool:manual-draft';

function getLastSport(): SportType | '' {
  const value = localStorage.getItem(lastSportKey);
  return value === 'running' || value === 'walking' ? value : '';
}

function getInitialValues(): ActivityFormValues {
  const fallback = emptyActivityForm(getLastSport());
  try {
    const stored = sessionStorage.getItem(manualDraftKey);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as Partial<Record<keyof ActivityFormValues, unknown>>;
    const restored = { ...fallback };
    for (const key of Object.keys(fallback) as Array<keyof ActivityFormValues>) {
      if (typeof parsed[key] === 'string') restored[key] = parsed[key] as never;
    }
    if (restored.sportType !== '' && restored.sportType !== 'running' && restored.sportType !== 'walking') {
      restored.sportType = fallback.sportType;
    }
    return restored;
  } catch {
    return fallback;
  }
}

function saveDraft(values: ActivityFormValues) {
  try {
    sessionStorage.setItem(manualDraftKey, JSON.stringify(values));
  } catch {
    // The form remains usable when storage is unavailable.
  }
}

export function ManualActivityPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const initialValues = useMemo(() => getInitialValues(), []);
  const create = useMutation({
    mutationFn: createActivity,
    onSuccess: async (activity) => {
      localStorage.setItem(lastSportKey, activity.sportType);
      sessionStorage.removeItem(manualDraftKey);
      await queryClient.invalidateQueries({ queryKey: ['activities'] });
      await queryClient.invalidateQueries({ queryKey: ['summary'] });
      navigate(`/activities/${activity.id}`, { replace: true });
    },
  });

  return (
    <div className="page-stack manual-entry-page">
      <ActivityForm
        initialValues={initialValues}
        importId={null}
        mode="manual"
        submitLabel="保存运动记录"
        busy={create.isPending}
        onValuesChange={saveDraft}
        onSubmit={async (data) => { await create.mutateAsync(data); }}
      />
      {create.error && <p className="form-error" role="alert">{create.error.message}</p>}
    </div>
  );
}
