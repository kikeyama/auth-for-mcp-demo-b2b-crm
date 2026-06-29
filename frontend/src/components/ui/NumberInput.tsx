'use client';

import { useState } from 'react';

interface Props {
  name: string;
  defaultValue?: number | string;
  className?: string;
  placeholder?: string;
}

export function NumberInput({ name, defaultValue, className, placeholder }: Props) {
  const n = Number(defaultValue);
  const initial = defaultValue != null && defaultValue !== '' && !isNaN(n) ? String(Math.round(n)) : '';
  const [raw, setRaw] = useState(initial);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setRaw(e.target.value.replace(/\D/g, ''));
  }

  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        value={raw !== '' ? Number(raw).toLocaleString('ja-JP') : ''}
        onChange={handleChange}
        className={className}
        placeholder={placeholder}
      />
      <input type="hidden" name={name} value={raw} />
    </>
  );
}
