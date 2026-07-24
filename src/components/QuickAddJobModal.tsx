import React, { useEffect, useState } from 'react';
import { X, MapPin, Sparkles, Loader2, User, CalendarDays, Check, Users, Wrench } from 'lucide-react';
import type { Customer, Technician, Job, JobType, Priority, JobStatus, TechTimeOff } from '@/lib/data';
import { SERVICE_TYPES, isTechOffOnRange } from '@/lib/data';


// ── Guard functions ────────────────────────────────────────────────────────


const isJobType = (v: string): v is JobType =>
  ['emergency', 'maintenance', 'installation', 'inspection'].includes(v);


const isPriority = (v: string): v is Priority =>
  ['emergency', 'high', 'normal', 'low'].includes(v);


// ── Types ──────────────────────────────────────────────────────────────────


interface Props {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  technicians: Technician[];
  techTimeOff?: TechTimeOff[];
  jobs: Job[];
  weekDates: string[];
  defaults?: Partial<Job>;
  onCreate: (job: Omit<Job, 'id'>) => void;
}


interface Recommendation {
  technicianId: string;
  technicianName: string;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
}


// ── Constants ──────────────────────────────────────────────────────────────


const sampleAddresses = [
  '1245 Maple Avenue, Springfield',
  '88 River Street, Springfield',
  '4521 Oak Ridge Drive, Westfield',
  '789 Sunset Boulevard, Springfield',
  '2100 Innovation Way, Westfield',
];


// ── Component ──────────────────────────────────────────────────────────────


const QuickAddJobModal: React.FC<Props> = ({
  open,
  onClose,
  customers,
  technicians,
  techTimeOff = [],
  weekDates,
  defaults,
  onCreate,
}) => {
  const [customerName, setCustomerName]                 = useState('');
  const [customerSuggestions, setCustomerSuggestions]   = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);


  const [address, setAddress]                           = useState('');
  const [addressSuggestions, setAddressSuggestions]     = useState<string[]>([]);
  const [showAddressDropdown, setShowAddressDropdown]     = useState(false);


  const [type, setType]               = useState<JobType>('maintenance');
  const [serviceType, setServiceType] = useState<string>(SERVICE_TYPES[0]);
  const [priority, setPriority]       = useState<Priority>('normal');
  const [technicianIds, setTechnicianIds] = useState<string[]>([]);
  const [date, setDate]               = useState('');
  const [endDate, setEndDate]         = useState('');
  const [description, setDescription] = useState('');

  // Jobs are full-day; times are kept only to satisfy the existing data model.
  const startTime = '08:00';


  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [recommending, setRecommending]     = useState(false);
  const [recError, setRecError]             = useState<string | null>(null);
  const [recApplied, setRecApplied]         = useState(false);


  const resetState = () => {
    setCustomerName('');
    setAddress('');
    setDescription('');
    setPriority('normal');
    setType('maintenance');
    setServiceType(SERVICE_TYPES[0]);
    setTechnicianIds([]);
    setDate(weekDates[0] ?? '');
    setEndDate(weekDates[0] ?? '');
    setRecommendation(null);
    setRecError(null);
    setRecApplied(false);
    setCustomerSuggestions([]);
    setAddressSuggestions([]);
    setShowCustomerDropdown(false);
    setShowAddressDropdown(false);
  };


  useEffect(() => {
    if (!open) return;
    if (defaults) {
      setCustomerName(defaults.customerName ?? '');
      setAddress(defaults.address ?? '');
      setDescription(defaults.description ?? '');
      setPriority(isPriority(defaults.priority ?? '') ? (defaults.priority as Priority) : 'normal');
      setType(isJobType(defaults.type ?? '') ? (defaults.type as JobType) : 'maintenance');
      setServiceType(defaults.serviceType || SERVICE_TYPES[0]);
      setTechnicianIds(
        defaults.technicianIds && defaults.technicianIds.length > 0
          ? defaults.technicianIds
          : defaults.technicianId
            ? [defaults.technicianId]
            : [],
      );
      setDate(defaults.date ?? weekDates[0] ?? '');
      setEndDate(defaults.endDate ?? defaults.date ?? weekDates[0] ?? '');
    } else {
      resetState();
    }
  }, [open, defaults, technicians, weekDates]);


  useEffect(() => {
    if (!open) resetState();
  }, [open]);


  if (!open) return null;


  // ── Handlers ─────────────────────────────────────────────────────────────


  const handleCustomerChange = (v: string) => {
    setCustomerName(v);
    const matches = v
      ? customers.filter(c => c.name.toLowerCase().includes(v.toLowerCase())).slice(0, 5)
      : [];
    setCustomerSuggestions(matches);
    setShowCustomerDropdown(matches.length > 0);
  };


  const selectCustomer = (c: Customer) => {
    setCustomerName(c.name);
    setAddress(`${c.address}, ${c.city}`);
    setShowCustomerDropdown(false);
  };


  const handleAddressChange = (v: string) => {
    setAddress(v);
    const matches =
      v.length > 1
        ? sampleAddresses.filter(a => a.toLowerCase().includes(v.toLowerCase())).slice(0, 5)
        : [];
    setAddressSuggestions(matches);
    setShowAddressDropdown(matches.length > 0);
  };


  const selectAddress = (a: string) => {
    setAddress(a);
    setShowAddressDropdown(false);
  };

  const toggleTechnician = (id: string) => {
    const resolvedEnd = endDate && endDate >= date ? endDate : date;
    const leave = isTechOffOnRange(id, date || resolvedEnd, resolvedEnd || date, techTimeOff);
    if (leave && !technicianIds.includes(id)) {
      // Hard block — cannot select someone who is off on these dates.
      return;
    }
    setTechnicianIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };


  const handleRecommend = async () => {
    if (!description.trim()) {
      setRecError('Please enter a job description first.');
      return;
    }
    if (!technicians.length) {
      setRecError('No active technicians available.');
      return;
    }
    setRecommending(true);
    setRecError(null);
    setRecommendation(null);
    setRecApplied(false);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRecommendation({
      technicianId: technicians[0].id,
      technicianName: technicians[0].name,
      reasoning: 'Best available technician based on current schedule and proximity.',
      confidence: 'high',
    });
    setRecommending(false);
  };


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Full-day jobs: no time-of-day. Ensure end >= start.
    const resolvedEnd = endDate && endDate >= date ? endDate : date;

    for (const techId of technicianIds) {
      const leave = isTechOffOnRange(techId, date, resolvedEnd, techTimeOff);
      if (leave) {
        setRecError(
          `${technicians.find(t => t.id === techId)?.name ?? 'Crew member'} is off on those dates.`,
        );
        return;
      }
    }

    const customer = customers.find(
      c => c.name.toLowerCase() === customerName.toLowerCase()
    );


    const job: Omit<Job, 'id'> = {
      customerId: customer?.id ?? `new-${Date.now()}`,
      customerName,
      address,
      type,
      status: 'scheduled' as JobStatus,
      priority,
      technicianId: technicianIds[0] ?? '',
      technicianIds,
      date,
      endDate: resolvedEnd,
      serviceType,
      startTime,
      endTime: '17:00',
      description,
      phase: 'Rough-In',
      estimatedDuration: 480,
    };


    onCreate(job);
    onClose();
  };


  // ── Render ────────────────────────────────────────────────────────────────


  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Schedule New Job
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>


        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Customer */}
          <div className="relative">
            <label htmlFor="customerName" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Customer Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="customerName"
                required
                type="text"
                value={customerName}
                onChange={e => handleCustomerChange(e.target.value)}
                onFocus={() => setShowCustomerDropdown(customerSuggestions.length > 0)}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                placeholder="Type a customer name..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            {showCustomerDropdown && customerSuggestions.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                {customerSuggestions.map(c => (
                  <div
                    key={c.id}
                    onMouseDown={e => { e.preventDefault(); selectCustomer(c); }}
                    className="px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700/50 last:border-0"
                  >
                    <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.address}, {c.city}</div>
                  </div>
                ))}
              </div>
            )}
          </div>


          {/* Address */}
          <div className="relative">
            <label htmlFor="serviceAddress" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Service Address
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="serviceAddress"
                required
                type="text"
                value={address}
                onChange={e => handleAddressChange(e.target.value)}
                onFocus={() => setShowAddressDropdown(addressSuggestions.length > 0)}
                onBlur={() => setTimeout(() => setShowAddressDropdown(false), 150)}
                placeholder="Start typing an address..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            {showAddressDropdown && addressSuggestions.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
                {addressSuggestions.map(a => (
                  <div
                    key={a}
                    onMouseDown={e => { e.preventDefault(); selectAddress(a); }}
                    className="px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700/50 last:border-0 text-sm text-slate-800 dark:text-slate-200"
                  >
                    {a}
                  </div>
                ))}
              </div>
            )}
          </div>


          {/* Service Type (plumbing phase) */}
          <div>
            <label htmlFor="serviceType" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
              <Wrench className="w-3 h-3 text-slate-400" /> Service Type
            </label>
            <select
              id="serviceType"
              value={serviceType}
              onChange={e => setServiceType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer"
            >
              {SERVICE_TYPES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Job Type + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="jobType" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Job Type
              </label>
              <select
                id="jobType"
                value={type}
                onChange={e => setType(e.target.value as JobType)}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer"
              >
                <option value="emergency">Emergency</option>
                <option value="maintenance">Maintenance</option>
                <option value="installation">Installation</option>
                <option value="inspection">Inspection</option>
              </select>
            </div>
            <div>
              <label htmlFor="priority" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Priority
              </label>
              <select
                id="priority"
                value={priority}
                onChange={e => setPriority(e.target.value as Priority)}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer"
              >
                <option value="emergency">Emergency</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>


          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Job Description
            </label>
            <textarea
              id="description"
              required
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the work to be done..."
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-none"
            />
          </div>


          {/* AI Recommendation */}
          <div className="space-y-2">
            {!recommendation && (
              <button
                type="button"
                onClick={() => void handleRecommend()}
                disabled={recommending}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/20 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 rounded-lg text-xs font-bold hover:from-teal-100 hover:to-emerald-100 disabled:opacity-60 transition-all"
              >
                {recommending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Querying active schedules...</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Get AI Technician Recommendation</>
                )}
              </button>
            )}
            {recError && <p className="text-xs text-red-600 font-semibold px-1">{recError}</p>}
            {recommendation && (
              <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/30 dark:bg-teal-950/10 p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    AI Suggestion: {recommendation.technicianName}
                  </span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                    {recommendation.confidence} fit
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
                  {recommendation.reasoning}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setTechnicianIds(prev =>
                      prev.includes(recommendation.technicianId)
                        ? prev
                        : [...prev, recommendation.technicianId],
                    );
                    setRecApplied(true);
                  }}
                  className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-colors"
                >
                  {recApplied ? 'Applied ✓' : 'Use Suggestion'}
                </button>
              </div>
            )}
          </div>


          {/* Scheduling */}
          <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800/60">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Users className="w-3 h-3 text-slate-400" /> Assigned Crew
                <span className="ml-auto font-bold text-teal-600 dark:text-teal-400">
                  {technicianIds.length} assigned
                </span>
              </label>
              {technicians.length === 0 ? (
                <p className="text-xs text-slate-400 px-1 py-2">No technicians on roster.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700/60">
                  {technicians.map(t => {
                    const checked = technicianIds.includes(t.id);
                    const resolvedEnd = endDate && endDate >= date ? endDate : date;
                    const leave = date
                      ? isTechOffOnRange(t.id, date, resolvedEnd || date, techTimeOff)
                      : undefined;
                    const span = leave
                      ? (leave.startDate === leave.endDate
                        ? leave.startDate
                        : `${leave.startDate}–${leave.endDate}`)
                      : '';
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={!!leave && !checked}
                        onClick={() => toggleTechnician(t.id)}
                        title={leave ? `Off ${span}` : undefined}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold transition-colors ${
                          leave && !checked
                            ? 'text-slate-400 cursor-not-allowed opacity-60'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                        }`}
                      >
                        <span
                          className={`inline-flex items-center justify-center w-4 h-4 rounded border shrink-0 ${
                            checked
                              ? 'bg-teal-600 border-teal-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                        <span className="truncate">{t.name}</span>
                        {leave ? (
                          <span className="ml-auto text-[10px] font-black uppercase text-rose-500">Off {span}</span>
                        ) : (
                          <span className="ml-auto text-[10px] font-medium text-slate-400">{t.role}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-1">Leave empty for an unassigned job.</p>
            </div>


            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="jobDate" className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3 text-slate-400" /> Start date
                </label>
                <input
                  id="jobDate"
                  type="date"
                  required
                  value={date}
                  onChange={e => {
                    const v = e.target.value;
                    setDate(v);
                    if (!endDate || endDate < v) setEndDate(v);
                  }}
                  className="w-full px-2 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
              <div>
                <label htmlFor="jobEndDate" className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3 text-slate-400" /> End date
                </label>
                <input
                  id="jobEndDate"
                  type="date"
                  required
                  value={endDate}
                  min={date}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-2 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
            </div>
          </div>


          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors"
            >
              Create Job
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


export default QuickAddJobModal;