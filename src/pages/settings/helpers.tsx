import React from 'react';

export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-primary-200 dark:border-primary-800 last:border-0">
      <div>
        <p className="font-medium text-sm">{label}</p>
        {hint && <p className="text-xs text-primary-500 mt-0.5">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-3">
      <p className="text-xs text-primary-500">{label}</p>
      <p className="num text-xl font-bold">{value.toLocaleString('fr-FR')}</p>
    </div>
  );
}

export function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs text-primary-500 font-medium block mb-1">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-primary-500 font-medium block mb-1">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
