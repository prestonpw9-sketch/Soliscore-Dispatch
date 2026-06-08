import React, { useState } from 'react';
import { Search, Phone, Mail, MapPin, Building2, Home, Calendar, Plus, HardHat, FileText, X } from 'lucide-react';
import type { Customer } from '@/lib/data';

interface Props {
  customers: Customer[];
  onCall: (c: Customer) => void;
  onSchedule: (c: Customer) => void;
  // We add this optional prop so you can hook it up to your database later!
  onCreateCustomer?: (c: Partial<Customer>) => void; 
}

const MOCK_BUILDER_PROJECTS = [
  { id: 'p1', name: 'Oak Springs Subdivision', activePhases: 3, lastUpdate: '2026-05-30', status: 'Active' },
  { id: 'p2', name: 'Downtown Commercial Retail', activePhases: 1, lastUpdate: '2026-06-01', status: 'Pending Rough-in' }
];

const CustomersView: React.FC<Props> = ({ customers, onCall, onSchedule, onCreateCustomer }) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'Residential' | 'Commercial'>('all');
  const [selected, setSelected] = useState<Customer | null>(null);
  
  // NEW STATE: Controls whether the "New Builder" modal is visible
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [newBuilder, setNewBuilder] = useState({ name: '', phone: '', email: '', address: '', city: '' });

  const filtered = customers.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.address.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    const matchType = typeFilter === 'all' || c.propertyType === typeFilter;
    return matchSearch && matchType;
  });

  const handleSaveBuilder = (e: React.FormEvent) => {
    e.preventDefault();
    if (onCreateCustomer) {
      // Pass the new builder up to your database, automatically tagged as Commercial
      onCreateCustomer({ ...newBuilder, propertyType: 'Commercial', totalJobs: 0 });
    } else {
      // Temporary alert just so you know it works until we hook it to Supabase!
      alert(`Successfully created Commercial Builder: ${newBuilder.name}`);
    }
    setShowBuilderModal(false);
    setNewBuilder({ name: '', phone: '', email: '', address: '', city: '' }); // Clear the form
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4 w-full relative">
      
      {/* LEFT SIDE: The Customer List */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder="Search customers by name, address, or phone..." 
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white" 
            />
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            {(['all', 'Residential', 'Commercial'] as const).map(t => (
              <button 
                key={t} 
                onClick={() => setTypeFilter(t)} 
                className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  typeFilter === t 
                    ? t === 'Commercial' ? 'bg-purple-600 text-white' : 'bg-teal-600 text-white' 
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {t === 'all' ? 'All' : t === 'Commercial' ? 'Builders/Commercial' : t}
              </button>
            ))}
            <div className="h-6 w-px bg-slate-300 dark:bg-slate-700 mx-1"></div>
            
            {/* THIS BUTTON IS NOW WIRED UP! */}
            <button 
              onClick={() => setShowBuilderModal(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Builder
            </button>
          </div>

        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm card">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map(c => (
              <button 
                key={c.id} 
                onClick={() => setSelected(c)} 
                className={`w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-3 ${selected?.id === c.id ? 'bg-teal-50 dark:bg-teal-900/20' : ''}`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${c.propertyType === 'Commercial' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' : 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300'}`}>
                  {c.propertyType === 'Commercial' ? <Building2 className="w-5 h-5" /> : <Home className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{c.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{c.address}, {c.city}</div>
                </div>
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300">{c.totalJobs} {c.propertyType === 'Commercial' ? 'Projects' : 'Jobs'}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Last: {c.lastService}</div>
                </div>
              </button>
            ))}
            {filtered.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No customers found.</div>}
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Details Panel */}
      <div className="lg:sticky lg:top-4 h-fit">
        {selected ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm card p-0 flex flex-col max-h-[85vh]">
            
            <div className={`p-6 text-white shrink-0 ${selected.propertyType === 'Commercial' ? 'bg-gradient-to-br from-purple-700 to-slate-900' : 'bg-gradient-to-br from-teal-600 to-teal-700'}`}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                  {selected.propertyType === 'Commercial' ? <Building2 className="w-6 h-6" /> : <Home className="w-6 h-6" />}
                </div>
                <div>
                  <div className="font-bold text-lg">{selected.name}</div>
                  <div className="text-sm text-white/80">{selected.propertyType === 'Commercial' ? 'General Contractor / Builder' : 'Residential Customer'}</div>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4 text-sm overflow-y-auto flex-1">
              
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-3 border border-slate-100 dark:border-slate-700/50">
                <div className="flex items-start gap-3"><Phone className="w-4 h-4 text-slate-400 mt-0.5" /><a href={`tel:${selected.phone}`} className="text-teal-600 dark:text-teal-400 hover:underline font-medium">{selected.phone}</a></div>
                <div className="flex items-start gap-3"><Mail className="w-4 h-4 text-slate-400 mt-0.5" /><a href={`mailto:${selected.email}`} className="text-teal-600 dark:text-teal-400 hover:underline break-all">{selected.email}</a></div>
                <div className="flex items-start gap-3"><MapPin className="w-4 h-4 text-slate-400 mt-0.5" /><span className="text-slate-700 dark:text-slate-300">{selected.address}<br />{selected.city}</span></div>
              </div>

              {selected.propertyType === 'Commercial' && (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-2">
                      <HardHat className="w-4 h-4 text-purple-600" /> Active Projects
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {MOCK_BUILDER_PROJECTS.map(proj => (
                      <div key={proj.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 hover:border-purple-400 dark:hover:border-purple-500 transition-colors cursor-pointer bg-white dark:bg-slate-800">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{proj.name}</span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{proj.status}</span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                          <FileText className="w-3 h-3" /> {proj.activePhases} Active Phases • Updated {proj.lastUpdate}
                        </div>
                      </div>
                    ))}
                    <button className="w-full py-2.5 mt-2 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 hover:text-purple-600 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors text-xs font-bold flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4" /> Add New Project
                    </button>
                  </div>
                </div>
              )}

              {selected.propertyType !== 'Commercial' && (
                <div className="pt-2">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Service Notes</div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    {selected.notes || "No service notes available for this residential property."}
                  </p>
                </div>
              )}

            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0">
              <div className="flex gap-2">
                <button onClick={() => onCall(selected)} className="flex-1 inline-flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium px-3 py-2 rounded-lg transition-colors">
                  <Phone className="w-4 h-4" /> Call
                </button>
                <button 
                  onClick={() => onSchedule(selected)} 
                  className={`flex-1 inline-flex items-center justify-center gap-2 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors shadow-sm ${selected.propertyType === 'Commercial' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-teal-600 hover:bg-teal-700'}`}
                >
                  {selected.propertyType === 'Commercial' ? <><HardHat className="w-4 h-4" /> New Phase</> : <><Calendar className="w-4 h-4" /> Schedule Job</>}
                </button>
              </div>
            </div>

          </div>
        ) : (
          <div className="bg-transparent border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-12 text-center flex flex-col items-center justify-center">
             <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <Building2 className="w-8 h-8 text-slate-400" />
             </div>
             <p className="text-slate-500 dark:text-slate-400 font-medium">Select a customer or builder from the list to view their details and active projects.</p>
          </div>
        )}
      </div>

      {/* ========================================= */}
      {/* ADD NEW BUILDER MODAL OVERLAY             */}
      {/* ========================================= */}
      {showBuilderModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-700 to-purple-900 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-200" />
                <h3 className="text-lg font-bold text-white">Add General Contractor</h3>
              </div>
              <button onClick={() => setShowBuilderModal(false)} className="p-1 hover:bg-white/20 rounded-lg text-purple-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveBuilder} className="p-6 space-y-4">
              
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Company / Builder Name *</label>
                <input 
                  required 
                  type="text"
                  value={newBuilder.name}
                  onChange={(e) => setNewBuilder({...newBuilder, name: e.target.value})}
                  placeholder="e.g. Summit Construction" 
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
                  <input 
                    type="tel"
                    value={newBuilder.phone}
                    onChange={(e) => setNewBuilder({...newBuilder, phone: e.target.value})}
                    placeholder="(555) 123-4567" 
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email</label>
                  <input 
                    type="email"
                    value={newBuilder.email}
                    onChange={(e) => setNewBuilder({...newBuilder, email: e.target.value})}
                    placeholder="contact@summit.com" 
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Main Office Address</label>
                <input 
                  type="text"
                  value={newBuilder.address}
                  onChange={(e) => setNewBuilder({...newBuilder, address: e.target.value})}
                  placeholder="123 Builder Way" 
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" 
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">City</label>
                <input 
                  type="text"
                  value={newBuilder.city}
                  onChange={(e) => setNewBuilder({...newBuilder, city: e.target.value})}
                  placeholder="Tucson" 
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" 
                />
              </div>

              <div className="flex gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setShowBuilderModal(false)} 
                  className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors"
                >
                  Save Builder
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default CustomersView;