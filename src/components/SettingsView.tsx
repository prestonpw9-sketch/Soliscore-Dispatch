import React, { useState } from 'react';
import { Building2, Bell, Database, KeyRound, HardHat, Save } from 'lucide-react';

const SettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'integrations'>('profile');

  // Business Profile State
  const [companyName, setCompanyName] = useState('Solidcore Plumbing, LLC');
  const [ownerName, setOwnerName] = useState('Preston Watson');
  const [location, setLocation] = useState('Tucson, AZ');
  const [license, setLicense] = useState('ROC Commercial'); // FIX: Normalized setter tracking name

  // Integrations State
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Settings saved successfully!');
  };

  return (
    // FIX: Wrapped contents inside a semantic form node so input submission hooks are responsive native system-wide
    <form onSubmit={handleSave} className="max-w-5xl mx-auto space-y-6">
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">System Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage your business profile, app preferences, and database connections.</p>
        </div>
        <button type="submit" className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm shrink-0">
          <Save className="w-4 h-4" /> Save Changes
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        
        {/* Settings Navigation Sidebar */}
        <div className="w-full md:w-64 shrink-0">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-row md:flex-col">
            <button 
              type="button"
              onClick={() => setActiveTab('profile')} 
              className={`flex-1 md:flex-none flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-b-2 md:border-b-0 md:border-l-2 ${activeTab === 'profile' ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <Building2 className="w-4 h-4" /> <span className="hidden sm:inline">Business Profile</span>
            </button>
            <button 
              type="button"
              onClick={() => setActiveTab('preferences')} 
              className={`flex-1 md:flex-none flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-b-2 md:border-b-0 md:border-l-2 ${activeTab === 'preferences' ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <Bell className="w-4 h-4" /> <span className="hidden sm:inline">Preferences</span>
            </button>
            <button 
              type="button"
              onClick={() => setActiveTab('integrations')} 
              className={`flex-1 md:flex-none flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-b-2 md:border-b-0 md:border-l-2 ${activeTab === 'integrations' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <Database className="w-4 h-4" /> <span className="hidden sm:inline">Integrations</span>
            </button>
          </div>
        </div>

        {/* Settings Content Area */}
        <div className="flex-1">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            
            {/* BUSINESS PROFILE TAB */}
            {activeTab === 'profile' && (
              <div className="p-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <HardHat className="w-5 h-5 text-teal-600" /> Company Details
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Company Entity Name</label>
                      <input 
                        type="text" 
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition-shadow" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Owner / Qualifying Party</label>
                      <input 
                        type="text" 
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition-shadow" 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Base Location</label>
                      <input 
                        type="text" 
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition-shadow" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">License Class</label>
                      <input 
                        type="text" 
                        value={license}
                        onChange={(e) => setLicense(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition-shadow" 
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PREFERENCES TAB */}
            {activeTab === 'preferences' && (
              <div className="p-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-teal-600" /> Notifications & Display
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div>
                      <div className="font-medium text-slate-900 dark:text-white text-sm">Emergency Job Alerts</div>
                      <div className="text-xs text-slate-500">Push notifications when high-priority calls come in.</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 dark:peer-focus:ring-teal-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-teal-600"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div>
                      <div className="font-medium text-slate-900 dark:text-white text-sm">Dark Mode</div>
                      <div className="text-xs text-slate-500">Toggle system theme preference.</div>
                    </div>
                    <select className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none cursor-pointer">
                      <option>System Default</option>
                      <option>Light</option>
                      <option>Dark</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* INTEGRATIONS TAB */}
            {activeTab === 'integrations' && (
              <div className="p-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-6">
                  <h3 className="text-sm font-bold text-purple-900 dark:text-purple-300 flex items-center gap-2 mb-1">
                    <Database className="w-4 h-4" /> Supabase Connection
                  </h3>
                  <p className="text-xs text-purple-700 dark:text-purple-400">Enter your project credentials to sync jobs, commercial phases, and dispatch records to the cloud.</p>
                </div>
                
                <div className="space-y-4">
                  <div>
                    {/* FIX 2: Cleared standard display layout typo syntax text string conflicts */}
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                      Project URL
                    </label>
                    <input 
                      type="url" 
                      value={supabaseUrl}
                      onChange={(e) => setSupabaseUrl(e.target.value)}
                      placeholder="https://your-project.supabase.co"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none transition-shadow" 
                    />
                  </div>
                  <div>
                    {/* FIX 2: Cleared duplicate text strings layout and class error syntax definitions */}
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                      <KeyRound className="w-3 h-3 text-purple-500" /> Anon / Public Key
                    </label>
                    <input 
                      type="password" 
                      value={supabaseKey}
                      onChange={(e) => setSupabaseKey(e.target.value)}
                      placeholder="eyJh..."
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none font-mono transition-shadow" 
                    />
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </form>
  );
};

export default SettingsView;