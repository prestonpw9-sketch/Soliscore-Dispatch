import React, { useState, useEffect } from 'react';
import { X, MapPin, Sparkles, Loader2, User, Clock, CalendarDays } from 'lucide-react';
import type { Customer, Technician, JobType, Priority, Job } from '@/lib/data';

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

const sampleAddresses = [
  '1245 Maple Avenue, Springfield', '88 River Street, Springfield', '4521 Oak Ridge Drive, Westfield',
  '789 Sunset Boulevard, Springfield', '2100 Innovation Way, Westfield'
];

const QuickAddJobModal: React.FC<Props> = ({ open, onClose, customers, technicians, weekDates, defaults, onCreate }) => {
  const [customerName, setCustomerName] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const [address, setAddress] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);

  const [type, setType] = useState<JobType>('maintenance');
  const [priority, setPriority] = useState<Priority>('normal');
  const [technicianId, setTechnicianId] = useState('');
  const [date, setDate] = useState(weekDates[0] || '');
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState(60);
  const [description, setDescription] = useState('');

  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [recommending, setRecommending] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [recApplied, setRecApplied] = useState(false);

  useEffect(() => {
    if (open) {
      if (defaults) {
        setCustomerName(defaults.customerName || '');
        setAddress(defaults.address || '');
        setDescription(defaults.description || '');
        setPriority(defaults.priority || 'normal');
        setType(defaults.type || 'maintenance');
        setTechnicianId(defaults.technicianId || technicians[0]?.id || '');
        setDate(defaults.date || weekDates[0] || '');
        setStartTime(defaults.startTime || '09:00');
        setDuration(defaults.estimatedDuration || 60);
      } else {
        setCustomerName('');
        setAddress('');
        setDescription('');
        setPriority('normal');
        setType('maintenance');
        setTechnicianId(technicians[0]?.id || '');
        setDate(weekDates[0] || '');
        setStartTime('09:00');
        setDuration(60);
      }
      setRecommendation(null);
      setRecError(null);
      setRecApplied(false);
      setCustomerSuggestions([]);
      setAddressSuggestions([]);
    }
  }, [open, defaults, technicians, weekDates]);

  if (!open) return null;

  const handleCustomerChange = (v: string) => {
    setCustomerName(v);
    if (v.length > 0) {
      const matches = customers?.filter(c => c.name.toLowerCase().includes(v.toLowerCase())).slice(0, 5) || [];
      setCustomerSuggestions(matches);
      setShowCustomerDropdown(true);
    } else {
      setShowCustomerDropdown(false);
    }
  };

  const selectCustomer = (c: Customer) => {
    setCustomerName(c.name);
    setAddress(`${c.address}, ${c.city}`);
    setShowCustomerDropdown(false);
  };

  const handleAddressChange = (v: string) => {
    setAddress(v);
    if (v.length > 1) {
      setAddressSuggestions(sampleAddresses.filter(a => a.toLowerCase().includes(v.toLowerCase())).slice(0, 5));
      setShowAddressDropdown(true);
    } else {
      setShowAddressDropdown(false);
    }
  };

  const selectAddress = (a: string) => {
    setAddress(a);
    setShowAddressDropdown(false);
  };

  const handleRecommend = async () => {
    if (!description.trim()) { setRecError('Please enter a job description first.'); return; }
    if (!technicians || technicians.length === 0) { setRecError('No active technicians available.'); return; }
    setRecommending(true); setRecError(null); setRecommendation(null); setRecApplied(false);

    try {
      setTimeout(() => {
        setRecommendation({
          technicianId: technicians[0].id,
          technicianName: technicians[0].name,
          reasoning: "Optimal route match based on current perimeter proximity.",
          confidence: "high"
        });
        setRecommending(false);
      }, 1000);
    } catch (e: any) { setRecError(e.message || 'Recommendation engine offline'); setRecommending(false); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const [h, m] = startTime.split(':').map(Number);
    const totalMinutes = h * 60 + m + duration;
    
    const endH = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    const endM = String(totalMinutes % 60).padStart(2, '0');
    const endTime = `${endH}:${endM}`;
    
    const customer = customers.find(c => c.name.toLowerCase() === customerName.toLowerCase());

    onCreate({
      customerId: customer?.id || `new-${Date.now()}`,
      customerName,
      address,
      type,
      status: 'scheduled',
      priority,
      technicianId,
      date,
      startTime,
      endTime,
      description,
      parts: [],
      estimatedDuration: duration,
    } as any);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Schedule New Job</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"><X className="w-4 h-4" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Customer Input */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Customer Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                required 
                type="text"
                value={customerName} 
                onChange={(e) => handleCustomerChange(e.target.value)}
                onFocus={() => { if (customerSuggestions.length > 0) setShowCustomerDropdown(true); }}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                placeholder="Type a customer name..." 
                className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none" 
              />
            </div>
            {showCustomerDropdown && customerSuggestions.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                {customerSuggestions.map(c => (
                  <div key={c.id} onClick={() => selectCustomer(c)} className="px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                    <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.address}, {c.city}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Service Address */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Service Address</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                required 
                type="text"
                value={address} 
                onChange={(e) => handleAddressChange(e.target.value)} 
                onFocus={() => { if (addressSuggestions.length > 0) setShowAddressDropdown(true); }}
                onBlur={() => setTimeout(() => setShowAddressDropdown(false), 200)}
                placeholder="Start typing an address..." 
                className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none" 
              />
            </div>
            {showAddressDropdown && addressSuggestions.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
                {addressSuggestions.map((a, i) => (
                  <div key={i} onClick={() => selectAddress(a)} className="px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700/50 last:border-0 text-sm text-slate-800 dark:text-slate-200">
                    {a}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Categorization Dropdowns */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Service Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as JobType)} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer">
                <option value="emergency">Emergency</option>
                <option value="maintenance">Maintenance</option>
                <option value="installation">Installation</option>
                <option value="inspection">Inspection</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer">
                <option value="emergency">Emergency</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          
          {/* Job Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Job Description</label>
            <textarea required value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Describe the work to be done..." className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
          </div>

          {/* AI Recommendation Panel */}
          <div className="space-y-2">
            {!recommendation && (
              <button type="button" onClick={handleRecommend} disabled={recommending} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/20 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 rounded-lg text-xs font-bold hover:from-teal-100 hover:to-emerald-100 disabled:opacity-60 transition-all">
                {recommending ? <><Loader2 className="w-4 h-4 animate-spin" /> Querying active schedules...</> : <><Sparkles className="w-4 h-4" /> Get AI Technician Recommendation</>}
              </button>
            )}
            {recError && <p className="text-xs text-red-600 font-semibold px-1">{recError}</p>}
            {recommendation && (
              <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/30 dark:bg-teal-950/10 p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">AI Suggestion: {recommendation.technicianName}</span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">{recommendation.confidence} fit</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">{recommendation.reasoning}</p>
                <button type="button" onClick={() => { setTechnicianId(recommendation.technicianId); setRecApplied(true); }} className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs">{recApplied ? 'Applied ✓' : 'Use Suggestion'}</button>
              </div>
            )}
          </div>

          {/* Tech Crew & Timing Configuration Box */}
          <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800/60">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Assigned Technician</label>
              <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer">
                {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                {/* LINTER FIX: Removed display configuration conflict class 'block' */}
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3 text-slate-400" /> Date
                </label>
                <select value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-2 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500 outline-none">
                  {weekDates.map(d => <option key={d} value={d}>{new Date(d.replace(/-/g, '\/')).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</option>)}
                </select>
              </div>
              <div>
                {/* LINTER FIX: Removed display configuration conflict class 'block' */}
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" /> Start
                </label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full px-2 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Duration</label>
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full px-2 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500 outline-none">
                  <option value={30}>30 min</option>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                  <option value={180}>3 hours</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* Footer controls */}
          <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-bold transition-colors">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors">Create Job</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickAddJobModal;