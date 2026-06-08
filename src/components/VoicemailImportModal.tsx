import React, { useState, useEffect } from 'react';
import { X, Voicemail, FileText, Loader2, Sparkles } from 'lucide-react';
import type { Call } from '@/lib/data';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (call: Omit<Call, 'id'>) => void;
  onCreatedToast: (msg: string) => void;
}

const VoicemailImportModal: React.FC<Props> = ({ open, onClose, onCreate, onCreatedToast }) => {
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (open) {
      setTranscript('');
      setIsProcessing(false);
    }
  }, [open]);

  if (!open) return null;

  const handleImport = () => {
    if (!transcript.trim()) return;
    setIsProcessing(true);

    // Simulate quick processing to turn transcript into a callback ticket
    setTimeout(() => {
      onCreate({
        customerName: "New Caller (Voicemail)",
        phone: "(555) 019-8273",
        address: "Pending Address",
        issue: transcript.substring(0, 60) + "...",
        status: "callback",
        priority: "normal",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        duration: "0:00"
      });
      
      setIsProcessing(false);
      onCreatedToast('Voicemail imported as pending callback');
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-red-500 to-orange-500 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Voicemail className="w-5 h-5" />
            <h3 className="text-lg font-bold">Import Google Voicemail</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300 text-sm p-4 rounded-xl border border-orange-200 dark:border-orange-800/50 flex gap-3">
            <Sparkles className="w-5 h-5 shrink-0 mt-0.5" />
            <p>Paste your Google Voice transcript below. The system will automatically extract the customer's issue and queue it as a callback.</p>
          </div>

          <div>
            <label className="block; text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Voicemail Transcript</label>
            <textarea 
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Example: Hi this is John from 123 Main St, my water heater is leaking everywhere please call me back..."
              className="w-full h-40 p-3 text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            <button 
              onClick={handleImport}
              disabled={!transcript.trim() || isProcessing}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white rounded-xl text-sm font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Extracting Data...</> : 'Parse & Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoicemailImportModal;