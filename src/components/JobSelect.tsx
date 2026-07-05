import React from 'react';
import type { Job } from '@/lib/data';

interface Props {
  jobs: Job[];
  value: string;
  onChange: (jobId: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  required?: boolean;
}

/** Compact dropdown for tagging uploads to a dispatch job. */
export const JobSelect: React.FC<Props> = ({
  jobs,
  value,
  onChange,
  id = 'job-select',
  className = '',
  placeholder = 'Select job…',
  required = false,
}) => {
  const sorted = [...jobs].sort((a, b) =>
    (a.customerName || '').localeCompare(b.customerName || ''),
  );

  return (
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      required={required}
      className={`text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2.5 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${className}`}
      aria-label="Select job for photo"
    >
      <option value="">{placeholder}</option>
      {sorted.map(job => (
        <option key={job.id} value={job.id}>
          {job.customerName}
          {job.address ? ` — ${job.address}` : ''}
        </option>
      ))}
    </select>
  );
};
