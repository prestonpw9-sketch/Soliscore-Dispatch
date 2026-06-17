import React from 'react';
import type { Job } from '@/lib/data';

interface SlideOutPanelProps {
  job: Job | null;
  onClose: () => void;
}

export default function SlideOutPanel({
  job,
  onClose,
}: SlideOutPanelProps) {
  if (!job) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close dispatch details panel"
        className="absolute inset-0 bg-black/20 backdrop-blur-sm cursor-pointer"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right border-l border-gray-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50">
          <h2 className="text-xl font-bold text-gray-900">Dispatch Details</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200 text-gray-500 transition-colors font-bold"
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          <div className="mb-6">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">
              Customer
            </p>
            <p className="text-lg font-medium text-gray-900">{job.customerName}</p>
            <p className="text-sm text-gray-500">{job.address}</p>
          </div>

          <div className="mb-6">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">
              Job Details
            </p>
            <div className="bg-blue-50 text-blue-900 p-4 rounded-lg border border-blue-100 text-sm space-y-1">
              <p><span className="font-semibold">Type:</span> {job.type}</p>
              <p><span className="font-semibold">Phase:</span> {job.phase}</p>
              <p><span className="font-semibold">Date:</span> {job.date}</p>
              <p><span className="font-semibold">Time:</span> {job.startTime} - {job.endTime}</p>
              <p><span className="font-semibold">Status:</span> {job.status}</p>
              {job.priority && (
                <p><span className="font-semibold">Priority:</span> {job.priority}</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">
              Internal Notes
            </p>
            <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-100">
              {job.description?.trim() || 'No internal notes added yet.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}