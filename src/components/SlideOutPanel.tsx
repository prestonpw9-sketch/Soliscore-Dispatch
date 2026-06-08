export default function SlideOutPanel({ job, onClose }: { job: any, onClose: () => void }) {
  // If no job is clicked, hide the panel completely
  if (!job) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      
      {/* The Dark Background Overlay (clicking it closes the panel) */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-sm cursor-pointer"
        onClick={onClose}
      ></div>

      {/* The Actual White Sliding Panel */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right border-l border-gray-200">
        
        {/* Panel Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50">
          <h2 className="text-xl font-bold text-gray-900">Dispatch Details</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200 text-gray-500 transition-colors font-bold"
          >
            ✕
          </button>
        </div>

        {/* Panel Body (Where the SMS history will go) */}
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="mb-6">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Customer</p>
            <p className="text-lg font-medium text-gray-900">{job.customerName}</p>
            <p className="text-sm text-gray-500">{job.address}</p>
          </div>

          <div className="mb-6">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Original Request</p>
            <div className="bg-blue-50 text-blue-900 p-4 rounded-lg border border-blue-100 text-sm">
              "Hey, we are ready for the underground inspection at the main commercial remodel tomorrow morning."
            </div>
            <p className="text-xs text-gray-400 mt-1 ml-1">Received via SMS</p>
          </div>
          
          <div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Internal Notes</p>
            <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-100 line-clamp-3">
              {job.description}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}