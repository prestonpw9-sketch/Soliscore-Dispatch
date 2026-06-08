import React, { useState } from 'react';
import { Phone, PhoneCall, PhoneOff, PhoneMissed, Clock, MapPin, AlertCircle, CalendarPlus, CheckCircle2, Search } from 'lucide-react';
import type { Call } from '@/lib/data';

interface Props {
  calls: Call[];
  onSchedule: (call: Call) => void;
  onComplete: (id: string) => void;
  onCallback: (call: Call) => void;
  compact?: boolean;
}

const priorityStyles: Record<string, string> = {
  emergency: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  normal: 'bg-teal-100 text-teal-700 border-teal-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

const statusIcon = (s: Call['status']) => {
  switch (s) {
    case 'active': return <PhoneCall className="w-4 h-4 text-emerald-600 animate-pulse" />;
    case 'missed': return <PhoneMissed className="w-4 h-4 text-red-600" />;
    case 'callback': return <Phone className="w-4 h-4 text-orange-600" />;
    case 'completed': return <PhoneOff className="w-4 h-4 text-slate-400" />;
  }
};

const CallsView: React.FC<Props> = ({ calls, onSchedule, onComplete, onCallback, compact }) => {
  const [filter, setFilter] = useState<'all' | Call['status']>('all');
  const [search, setSearch] = useState('');

  const filtered = calls.filter(c => {
    const matchFilter = filter === 'all' || c.status === filter;
    const matchSearch = !search || c.customerName.toLowerCase().includes(search.toLowerCase()) || c.issue.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <div className="space-y-4 w-full">
      {!compact && (
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search calls by name or issue..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none bg-white"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {(['all', 'active', 'callback', 'missed', 'completed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition-colors ${filter === f ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {f === 'all' ? 'All Calls' : f}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {filtered.length === 0 && <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm card">No calls match your filters.</div>}
        {filtered.map((call) => (
          <div key={call.id} className={`card ${call.status === 'active' ? 'border-emerald-300 ring-2 ring-emerald-100' : ''}`}>
            <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${call.status === 'active' ? 'bg-emerald-100' : call.status === 'missed' ? 'bg-red-50' : 'bg-slate-100'}`}>
                {statusIcon(call.status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-semibold text-slate-900 truncate dark:text-slate-100">{call.customerName}</h4>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${priorityStyles[call.priority]} capitalize`}>
                    {call.priority === 'emergency' && <AlertCircle className="w-3 h-3 inline mr-0.5" />}
                    {call.priority}
                  </span>
                  <span className="text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {call.time}{call.duration && <span className="ml-1">• {call.duration}</span>}</span>
                </div>
                <p className="text-sm text-slate-600 mt-1 line-clamp-2 dark:text-slate-300">{call.issue}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{call.phone}</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{call.address}</span>
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto mt-3 sm:mt-0">
                {call.status !== 'completed' && (
                  <>
                    <button onClick={() => onSchedule(call)} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg transition-colors"><CalendarPlus className="w-4 h-4" /> Schedule</button>
                    {(call.status === 'missed' || call.status === 'callback') && (
                      <button onClick={() => onCallback(call)} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors"><Phone className="w-4 h-4" /> Call Back</button>
                    )}
                    <button onClick={() => onComplete(call.id)} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"><CheckCircle2 className="w-4 h-4" /> Done</button>
                  </>
                )}
                {call.status === 'completed' && <span className="text-xs text-emerald-600 font-medium flex items-center gap-1 mt-2 sm:mt-0"><CheckCircle2 className="w-4 h-4" /> Resolved</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CallsView;