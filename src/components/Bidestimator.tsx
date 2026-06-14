import { useState } from 'react';
import { supabase } from '../lib/supabase';
declare const process: any;

// --- TYPESCRIPT DEFINITIONS ---
type BidItem = {
  id: number;
  size: string;
  item: string;
  price: number;
  quantity: number;
};

type BidSummary = {
  laborHours: number;
  laborRate: number;
  overheadPercent: number;
  profitPercent: number;
};

type BidData = {
  page1: BidItem[];
  page2: BidItem[];
  summary: BidSummary;
};

type TabType = 'page1' | 'page2' | 'summary';
// ------------------------------

export default function BidEstimator() {
  const [activeTab, setActiveTab] = useState<TabType>('page1');
  const [projectName, setProjectName] = useState<string>('New Plumbing Bid');
  
  // Strongly typed state holding your spreadsheet data
  const [bidData, setBidData] = useState<BidData>({
    page1: [
      { id: 1, size: '8"', item: '8 PVC DWV HXH 90 ELL', price: 41.70, quantity: 0 },
      { id: 2, size: '6"', item: '6 PVC DWV 90 ELL', price: 32.50, quantity: 0 },
      { id: 3, size: '4"', item: 'combos NO HUB C.I.', price: 71.92, quantity: 0 },
      // Paste the rest of your Page 1 CSV items here
    ],
    page2: [
      { id: 4, size: '1-1/2"', item: 'L SOFT COPPER', price: 9.64, quantity: 0 },
      // Paste the rest of your Page 2 Copper & Gas items here
    ],
    summary: {
      laborHours: 0,
      laborRate: 65,
      overheadPercent: 0.10, // 10%
      profitPercent: 0.12,   // 12%
    }
  });

  // Calculate total materials cost
  const calculateMaterialsTotal = (): number => {
    let total = 0;
    const pages: ('page1' | 'page2')[] = ['page1', 'page2'];
    
    pages.forEach(page => {
      bidData[page].forEach((item: BidItem) => {
        total += (item.price * item.quantity);
      });
    });
    return total;
  };

  // Handle updating a quantity
  const handleQuantityChange = (page: 'page1' | 'page2', index: number, newQuantity: string) => {
    const updatedData = { ...bidData };
    updatedData[page][index].quantity = Number(newQuantity);
    setBidData(updatedData);
  };

  // Handle saving the bid to Supabase
  const handleSaveAsNewJob = async () => {
    const materialsTotal = calculateMaterialsTotal();
    const laborTotal = bidData.summary.laborHours * bidData.summary.laborRate;
    const grandTotal = materialsTotal + laborTotal; 

    const { data, error } = await supabase
      .from('project_bids')
      .insert([
        { 
          project_name: projectName, 
          is_master: false, 
          takeoff_data: bidData,
          total_cost: grandTotal
        }
      ]);

    if (error) {
      alert('Error saving bid: ' + error.message);
    } else {
      alert('Success! Bid saved to database.');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto bg-white rounded-lg shadow-md">
      {/* Header Area */}
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <input 
          type="text" 
          className="text-2xl font-bold border-none focus:ring-0"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
        />
        <button 
          onClick={handleSaveAsNewJob}
          className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700"
        >
          Save As New Job
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 mb-4">
        <button onClick={() => setActiveTab('page1')} className={`px-4 py-2 ${activeTab === 'page1' ? 'bg-gray-200 font-bold' : ''}`}>Pg 1 (DWV)</button>
        <button onClick={() => setActiveTab('page2')} className={`px-4 py-2 ${activeTab === 'page2' ? 'bg-gray-200 font-bold' : ''}`}>Pg 2 (Copper/Gas)</button>
        <button onClick={() => setActiveTab('summary')} className={`px-4 py-2 ${activeTab === 'summary' ? 'bg-gray-200 font-bold' : ''}`}>Pg 4 (Totals)</button>
      </div>

      {/* Data Grid for Pages 1 & 2 */}
      {(activeTab === 'page1' || activeTab === 'page2') && (
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="p-2">Size</th>
              <th className="p-2">Item Description</th>
              <th className="p-2">Price</th>
              <th className="p-2 w-24">Quantity</th>
              <th className="p-2">Row Total</th>
            </tr>
          </thead>
          <tbody>
            {bidData[activeTab].map((item, index) => (
              <tr key={item.id} className="border-b hover:bg-gray-50">
                <td className="p-2">{item.size}</td>
                <td className="p-2">{item.item}</td>
                <td className="p-2">${item.price.toFixed(2)}</td>
                <td className="p-2">
                  <input 
                    type="number" 
                    min="0"
                    className="w-full border rounded p-1"
                    value={item.quantity === 0 ? '' : item.quantity}
                    onChange={(e) => handleQuantityChange(activeTab, index, e.target.value)}
                  />
                </td>
                <td className="p-2 font-semibold">
                  ${(item.price * item.quantity).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Summary Tab (Page 4) */}
      {activeTab === 'summary' && (
        <div className="p-4 bg-gray-50 rounded border">
          <h2 className="text-xl font-bold mb-4">Bid Totals</h2>
          <div className="flex justify-between mb-2">
            <span>Total Material:</span>
            <span className="font-bold">${calculateMaterialsTotal().toFixed(2)}</span>
          </div>
          <div className="flex justify-between mb-2 items-center">
            <span>Labor Hours (@ ${bidData.summary.laborRate}/hr):</span>
            <input 
              type="number" 
              className="border rounded p-1 w-24"
              value={bidData.summary.laborHours}
              onChange={(e) => setBidData({
                ...bidData, 
                summary: { ...bidData.summary, laborHours: Number(e.target.value) }
              })}
            />
          </div>
          <div className="flex justify-between mt-4 pt-4 border-t text-xl font-black text-green-700">
            <span>GRAND TOTAL:</span>
            <span>
              ${(calculateMaterialsTotal() + (bidData.summary.laborHours * bidData.summary.laborRate)).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}