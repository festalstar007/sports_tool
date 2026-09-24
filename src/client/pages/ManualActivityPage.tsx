import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SportType } from '../../shared/activity-schema';
import { createActivity } from '../api';
import { ActivityForm } from '../components/ActivityForm';
import { emptyActivityForm } from '../form';

const lastSportKey = 'sports-tool:last-manual-sport';

function getLastSport(): SportType | '' {
  const value = localStorage.getItem(lastSportKey);
  return value === 'running' || value === 'walking' ? value : '';
}

export function ManualActivityPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const initialValues = useMemo(() => emptyActivityForm(getLastSport()), []);
  const create = useMutation({
    mutationFn: createActivity,
    onSuccess: async (activity) => {
      localStorage.setItem(lastSportKey, activity.sportType);
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
        onSubmit={async (data) => { await create.mutateAsync(data); }}
      />
      {create.error && <p className="form-error" role="alert">{create.error.message}</p>}
    </div>
  );
}
