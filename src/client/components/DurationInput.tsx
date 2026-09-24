import { useEffect, useRef, useState } from 'react';
import { formatDuration, parseDuration } from '../../shared/units';

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

function splitDuration(value: string): [string, string, string] {
  const parts = value.split(':');
  if (parts.length === 3) return [parts[0] || '00', parts[1] || '00', parts[2] || '00'];
  if (parts.length === 2) return ['00', parts[0] || '00', parts[1] || '00'];
  return ['00', '00', '00'];
}

export function DurationInput({ value, onChange, disabled }: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [parts, setParts] = useState<[string, string, string]>(() => splitDuration(value));
  const partsRef = useRef(parts);
  const labels = ['小时', '分钟', '秒'] as const;

  useEffect(() => {
    const incoming = splitDuration(value);
    if (incoming.join(':') !== partsRef.current.join(':')) {
      partsRef.current = incoming;
      setParts(incoming);
    }
  }, [value]);

  function commit(next: [string, string, string]) {
    partsRef.current = next;
    setParts(next);
    onChange(next.join(':'));
  }

  function updatePart(index: number, nextValue: string) {
    const digits = nextValue.replace(/\D/g, '').slice(0, 2);
    const next = [...partsRef.current] as [string, string, string];
    next[index] = digits || '0';
    commit(next);
    if (digits.length === 2 && index < 2) refs.current[index + 1]?.focus();
  }

  function normalize() {
    const normalized = partsRef.current.map((part) => (part || '0').padStart(2, '0')) as [string, string, string];
    commit(normalized);
  }

  function pasteDuration(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text');
    const seconds = parseDuration(pasted);
    if (seconds == null) return;
    event.preventDefault();
    commit(splitDuration(formatDuration(seconds)));
  }

  return (
    <span className="duration-input" role="group" aria-label="运动时长">
      {parts.map((part, index) => (
        <span className="duration-part" key={labels[index]}>
          <input
            ref={(element) => { refs.current[index] = element; }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            value={part}
            aria-label={`运动时长-${labels[index]}`}
            disabled={disabled}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => updatePart(index, event.target.value)}
            onBlur={normalize}
            onPaste={pasteDuration}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && (part === '0' || part === '00') && index > 0) {
                refs.current[index - 1]?.focus();
              }
            }}
          />
          <small>{labels[index]}</small>
        </span>
      ))}
    </span>
  );
}
