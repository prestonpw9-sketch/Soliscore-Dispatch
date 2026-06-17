export type JobType = 'emergency' | 'maintenance' | 'installation' | 'inspection';
export type Priority = 'emergency' | 'high' | 'normal' | 'low';
export type CallStatus = 'active' | 'missed' | 'callback' | 'completed';
export type JobStatus = 'pending' | 'active' | 'completed';

export interface Call {
  id: string;
  customerName: string;
  phone: string;
  address: string;
  issue: string;
  status: CallStatus;
  priority: Priority;
  time: string;
  duration?: string;
}

export interface Job {
  id: string;
  customerId?: string; 
  customerName: string;
  address: string;
  date: string;
  startTime: string;
  endTime: string;
  technicianId: string;
  status: 'pending' | 'completed';
  type?: string;
  estimatedDuration?: number;
  phase: string;
}

export interface Technician {
  id: string;
  name: string;
  role: string;
  color?: string;
  skills?: string[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  propertyType: 'Residential' | 'Commercial';
  totalJobs: number;
  lastService: string;
  notes: string;
}

// Date Helpers
const today = new Date();
export const todayStr = today.toISOString().split('T')[0];

export const weekDates = Array.from({ length: 7 }).map((_, i) => {
  const d = new Date(today);
  d.setDate(today.getDate() - today.getDay() + i);
  return d.toISOString().split('T')[0];
});

export const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const hours = Array.from({ length: 12 }).map((_, i) => i + 7);

export const mockCustomers: Customer[] = [
  { id: 'c1', name: 'Canyon Ranch', phone: '(520) 555-0192', email: 'facilities@canyon.com', address: '8600 E Rockcliff Rd', city: 'Tucson', propertyType: 'Commercial', totalJobs: 14, lastService: '2026-04-15', notes: 'TIG welding required for custom washboards.' },
  { id: 'c2', name: 'Sarah Jenkins', phone: '(480) 555-0134', address: '1423 W Baseline Rd', email: 's.jenkins@email.com', city: 'Mesa', propertyType: 'Residential', totalJobs: 3, lastService: '2026-05-02', notes: 'Gate code 4921.' }
];

export const mockCalls: Call[] = [
  { id: 'call1', customerName: 'Robert Wilson', phone: '(520) 555-0188', address: 'Eastside Tucson', issue: 'Need quote for 40/40/20 phase rough-in on new build.', status: 'active', priority: 'high', time: '08:15 AM', duration: '04:30' },
  { id: 'call2', customerName: 'Community Center', phone: '(520) 555-0199', address: 'South Tucson', issue: 'Looking to upgrade gravity-fed urinals to sensor-operated fixtures.', status: 'missed', priority: 'normal', time: '07:45 AM' }
];

export const mockJobs: Job[] = [
  { id: 'j1', customerId: 'c1', customerName: 'Canyon Ranch', address: '8600 E Rockcliff Rd', type: 'installation', status: 'pending', technicianId: 't1', date: todayStr, startTime: '08:00', endTime: '12:00', estimatedDuration: 240, phase: 'Rough-In' },
  { id: 'j2', customerId: 'c2', customerName: 'Sarah Jenkins', address: '1423 W Baseline Rd', type: 'maintenance', status: 'pending', technicianId: 't2', date: todayStr, startTime: '13:00', endTime: '15:00', estimatedDuration: 120, phase: 'Trim' }
];