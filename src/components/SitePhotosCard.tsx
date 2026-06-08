import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Camera } from 'lucide-react';

export const SitePhotosCard = () => {
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<any[]>([]);

  // 1. Fetch the latest photos on load
  const fetchPhotos = async () => {
    const { data, error } = await supabase.storage
      .from('site-photos')
      .list('', {
        limit: 4, // Show the 4 most recent photos
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) {
      console.error('Error loading photos:', error);
    } else if (data) {
      // Filter out empty folder placeholders just in case
      const validFiles = data.filter(file => file.name !== '.emptyFolderPlaceholder');
      setPhotos(validFiles);
    }
  };

  useEffect(() => {
    fetchPhotos();
  }, []);

  // 2. Handle the Upload
  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      const file = event.target.files?.[0];
      if (!file) return;

      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
      const filePath = `${Date.now()}-${cleanFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('site-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      await fetchPhotos();
      
    } catch (error: any) {
      console.error('Upload failed:', error.message);
      alert('Failed to upload photo.');
    } finally {
      setUploading(false);
    }
  };

  // 3. Helper to get the actual image URL for the thumbnail
  const getImageUrl = (fileName: string) => {
    return supabase.storage.from('site-photos').getPublicUrl(fileName).data.publicUrl;
  };

  return (
    <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs flex flex-col h-full min-h-[250px]">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-indigo-500" />
            Site Photos
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Recent field uploads</p>
        </div>
        
        <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors flex items-center gap-2">
          {uploading ? '⏳...' : '📸 Upload'}
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={handlePhotoUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {/* Photo Gallery Grid */}
      <div className="flex-1 overflow-y-auto">
        {photos.length === 0 ? (
          <div className="text-sm text-slate-400 font-medium text-center mt-8">
            No site photos uploaded yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {photos.map((file) => (
              <div 
                key={file.id} 
                onClick={() => window.open(getImageUrl(file.name), '_blank')}
                className="relative group cursor-pointer aspect-video rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
              >
                <img 
                  src={getImageUrl(file.name)} 
                  alt="Site Photo" 
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-bold bg-black/60 px-2 py-1 rounded backdrop-blur-sm transition-opacity">
                    View
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};