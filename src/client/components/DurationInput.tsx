import { useEffect, useRef, useState } from 'react';
import { formatDuration, parseDuration } from '../../shared/units';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
};

function splitDuration(value: string): [string, string, string] {
  const parts = value.split(':');
  if (parts.length === 3) return [parts[0], parts[1], parts[2]];
  if (parts.length === 2) return ['00', parts[0], parts[1]];
  return ['00', '00', '00'];
}

export function DurationInput({ value, onChange, onBlur, disabled }: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const replaceOnNextInput = useRef([false, false, false]);
  const edited = useRef(false);
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

  function updatePart(index: number, nextValue: string, nativeEvent: InputEvent) {
    edited.current = true;
    let digits = nextValue.replace(/\D/g, '').slice(0, 2);
    if (replaceOnNextInput.current[index]) {
      const insertedDigits = nativeEvent.data?.replace(/\D/g, '') ?? '';
      if (nativeEvent.inputType.startsWith('delete')) {
        digits = '';
      } else if (insertedDigits) {
        digits = insertedDigits.slice(0, 2);
      } else if (/^0+$/.test(partsRef.current[index]) && digits.length > 1) {
        digits = digits.slice(-1);
      }
      replaceOnNextInput.current[index] = false;
    }
    const next = [...partsRef.current] as [string, string, string];
    next[index] = digits;
    commit(next);
    if (digits.length === 2 && index < 2) refs.current[index + 1]?.focus();
  }

  function clearSelectedPart(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const hasSelection = input.selectionStart !== input.selectionEnd;
    if (event.key !== 'Backspace' || (!hasSelection && partsRef.current[index] !== '0' && partsRef.current[index] !== '00')) {
      return false;
    }
    event.preventDefault();
    edited.current = true;
    replaceOnNextInput.current[index] = false;
    const next = [...partsRef.current] as [string, string, string];
    next[index] = '';
    commit(next);
    return true;
  }

  function normalize() {
    const shouldValidate = edited.current;
    edited.current = false;
    const normalized = partsRef.current.map((part) => (part || '0').padStart(2, '0')) as [string, string, string];
    commit(normalized);
    if (shouldValidate) onBlur?.();
  }

  function pasteDuration(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text');
    const seconds = parseDuration(pasted);
    if (seconds == null) return;
    event.preventDefault();
    edited.current = true;
    replaceOnNextInput.current = [false, false, false];
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
            onFocus={(event) => {
              replaceOnNextInput.current[index] = true;
              event.currentTarget.select();
            }}
            onChange={(event) => updatePart(index, event.target.value, event.nativeEvent as InputEvent)}
            onBlur={normalize}
            onPaste={pasteDuration}
            onKeyDown={(event) => {
              if (clearSelectedPart(index, event)) return;
              if (event.key === 'Backspace' && part === '' && index > 0) {
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
