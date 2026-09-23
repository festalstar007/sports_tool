import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { createActivity, getImport, retryImport } from '../api';
import { ActivityForm } from '../components/ActivityForm';
import { recognitionToForm } from '../form';

export function ImportReviewPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['import', id], queryFn: () => getImport(id), enabled: Boolean(id) });
  const create = useMutation({
    mutationFn: createActivity,
    onSuccess: async (activity) => {
      await queryClient.invalidateQueries({ queryKey: ['activities'] });
      await queryClient.invalidateQueries({ queryKey: ['summary'] });
      navigate(`/activities/${activity.id}`, { replace: true });
    },
  });
  const retry = useMutation({
    mutationFn: () => retryImport(id),
    onSuccess: (data) => queryClient.setQueryData(['import', id], data),
  });

  if (query.isLoading) return <div className="state-card">正在读取截图…</div>;
  if (query.error || !query.data) return <div className="state-card error">无法读取导入记录：{query.error?.message}</div>;
  const item = query.data;

  return (
    <div className="page-stack review-page">
      <section className="screenshot-card">
        <img src={`/api/imports/${id}/image`} alt="上传的运动详情截图" />
        <div>
          <strong>{item.status === 'failed' ? '识别未完成' : item.recognitionErrorCode === 'AI_NOT_CONFIGURED' ? '等待手工确认' : '识别完成'}</strong>
          <p>{item.recognitionErrorCode === 'AI_NOT_CONFIGURED'
            ? '当前未启用自动识别，下面的示例文字不是识别结果。请根据截图填写必填项后保存。'
            : item.recognitionErrorMessage ?? '请核对下面每项数据后保存。'}</p>
          {item.status === 'failed' && (
            <button className="text-button" type="button" disabled={retry.isPending} onClick={() => retry.mutate()}>
              {retry.isPending ? '正在重试…' : '重新识别'}
            </button>
          )}
        </div>
      </section>
      <ActivityForm
        key={item.updatedAt}
        initialValues={recognitionToForm(item.extraction)}
        importId={item.id}
        confidence={item.extraction?.confidence}
        submitLabel="确认并保存"
        busy={create.isPending}
        onSubmit={async (data) => { await create.mutateAsync(data); }}
      />
      {create.error && <p className="form-error" role="alert">{create.error.message}</p>}
    </div>
  );
}
