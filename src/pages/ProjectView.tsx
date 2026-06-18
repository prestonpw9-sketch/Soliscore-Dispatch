import React, { useState } from 'react';
import EstimatorPanel from '../components/EstimatorPanel';
import QuickBidEstimator from '../components/QuickBidEstimator';

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ProjectView({ projectId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex">
      {/* Project details */}
      <div className="w-2/3 p-4" />

      <div className="w-1/3 p-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="project-estimator-panel"
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded transition-colors"
        >
          Open Quick Bid
        </button>
      </div>

      <EstimatorPanel
        open={open}
        onClose={() => setOpen(false)}
      >
        <QuickBidEstimator mode="standalone" />
      </EstimatorPanel>
    </div>
  );
}