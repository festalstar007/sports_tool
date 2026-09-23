type Props = {
  label: string;
  value: string;
  tone?: 'green' | 'orange' | 'blue';
};

export function MetricCard({ label, value, tone = 'green' }: Props) {
  return (
    <div className={`metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
