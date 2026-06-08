import React, { useState } from 'react';
import EstimatorPanel from '../components/EstimatorPanel';
import QuickBidEstimator from '../components/QuickBidEstimator';

export default function ProjectView({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex">
      <div className="w-2/3 p-4"> {/* project details here */} </div>

      <div className="w-1/3 p-4">
        <button onClick={() => setOpen(true)} className="bg-blue-600 text-white px-3 py-2 rounded">Open Quick Bid</button>
      </div>

      <EstimatorPanel open={open} onClose={() => setOpen(false)}>
        <QuickBidEstimator mode="project" projectId={projectId} />
      </EstimatorPanel>
    </div>
  );
}
