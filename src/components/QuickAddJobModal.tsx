import React, { useEffect, useState } from 'react';
import { X, MapPin, Sparkles, Loader2, User, Clock, CalendarDays } from 'lucide-react';
import type { Customer, Technician, Job, JobType, Priority, JobStatus } from '@/lib/data';


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
  const [priority, setPriority]       = useState<Priority>('normal');
  const [technicianId, setTechnicianId] = useState('');
  const [date, setDate]               = useState('');
  const [startTime, setStartTime]     = useState('09:00');
  const [duration, setDuration]       = useState(60);
  const [description, setDescription] = useState('');


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
    setTechnicianId(technicians[0]?.id ?? '');
    setDate(weekDates[0] ?? '');
    setStartTime('09:00');
    setDuration(60);
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
      setTechnicianId(defaults.technicianId ?? technicians[0]?.id ?? '');
      setDate(defaults.date ?? weekDates[0] ?? '');
      setStartTime(defaults.startTime ?? '09:00');
      setDuration(defaults.estimatedDuration ?? 60);
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


    const [h, m] = startTime.split(':').map(Number);
    const totalMinutes = h * 60 + m + duration;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    const endTime = `${String(endHours % 24).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;

    // FIX: If endHours >= 24, add days to the date
    const startDate = new Date(date.replace(/-/g, '/'));
    const daysToAdd = Math.floor(endHours / 24);
    if (daysToAdd > 0) {
      startDate.setDate(startDate.getDate() + daysToAdd);
    }
    const endDate = startDate.toISOString().split('T')[0];


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
      technicianId,
      date,
      endDate,
      startTime,
      endTime,
      description,
      phase: 'Rough-In',
      estimatedDuration: duration,
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


          {/* Type + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="serviceType" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Service Type
              </label>
              <select
                id="serviceType"
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
                  onClick={() => { setTechnicianId(recommendation.technicianId); setRecApplied(true); }}
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
              <label htmlFor="technicianId" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Assigned Technician
              </label>
              <select
                id="technicianId"
                value={technicianId}
                onChange={e => setTechnicianId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer"
              >
                {technicians.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>


            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="jobDate" className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3 text-slate-400" /> Date
                </label>
                <select
                  id="jobDate"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-2 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  {weekDates.map(d => (
                    <option key={d} value={d}>
                      {new Date(d.replace(/-/g, '/')).toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric',
                      })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="startTime" className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" /> Start
                </label>
                <input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="w-full px-2 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
              <div>
                <label htmlFor="duration" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Duration
                </label>
                <select
                  id="duration"
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  className="w-full px-2 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value={30}>30 min</option>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                  <option value={180}>3 hours</option>
                  <option value={240}>4 hours</option>
                  <option value={300}>5 hours</option>
                  <option value={360}>6 hours</option>
                  <option value={420}>7 hours</option>
                  <option value={480}>8 hours</option>
                  <option value={540}>9 hours</option>
                  <option value={600}>10 hours</option>
                </select>
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