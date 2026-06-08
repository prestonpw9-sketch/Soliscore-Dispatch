import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase'; 

export const BlueprintCard = () => {
  const [uploading, setUploading] = useState(false);
  const [blueprints, setBlueprints] = useState<any[]>([]);

  // 1. Fetch the latest blueprints on load
  const fetchBlueprints = async () => {
    const { data, error } = await supabase.storage
      .from('blueprints')
      .list('', {
        limit: 4, // Show the 4 most recent plans
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) {
      console.error('Error loading blueprints:', error);
    } else if (data) {
      setBlueprints(data);
    }
  };

  useEffect(() => {
    fetchBlueprints();
  }, []);

  // 2. Handle the Upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      const file = event.target.files?.[0];
      if (!file) return;

      // Clean the file name and make it unique
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
      const filePath = `${Date.now()}-${cleanFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('blueprints')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Refresh the list instantly to show the new file
      await fetchBlueprints();
      alert('Blueprint locked in!');
      
    } catch (error: any) {
      console.error('Upload failed:', error.message);
      alert('Failed to upload blueprint.');
    } finally {
      setUploading(false);
    }
  };

  // 3. Helper to open the file in a new tab
  const openFile = (fileName: string) => {
    const { data } = supabase.storage
      .from('blueprints')
      .getPublicUrl(fileName);
    
    window.open(data.publicUrl, '_blank');
  };

  return (
    <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs flex flex-col h-full min-h-[250px]">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white">Job Blueprints</h3>
          <p className="text-xs text-slate-500 mt-0.5">Active site plans & schematics</p>
        </div>
        
        {/* Upload Button */}
        <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors flex items-center gap-2">
          {uploading ? '⏳ Uploading...' : '➕ Add Plan'}
          <input 
            type="file" 
            accept=".pdf,.png,.jpg,.jpeg" 
            className="hidden" 
            onChange={handleFileUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto">
        {blueprints.length === 0 ? (
          <div className="text-sm text-slate-400 font-medium text-center mt-8">
            No blueprints uploaded yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {blueprints.map((file) => (
              <li 
                key={file.id} 
                onClick={() => openFile(file.name)}
                className="group flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <span className="text-xl">📄</span>
                  <div className="truncate text-sm font-bold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {/* Clean up the timestamp for the display name */}
                    {file.name.substring(file.name.indexOf('-') + 1)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};