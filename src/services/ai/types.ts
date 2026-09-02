export type AIProvider = 'gemini' | 'copilot';
export type MessageRole = 'user' | 'assistant' | 'system';

export interface AIMessage {
  id: string;
  role: MessageRole;
  content: string;
  provider: AIProvider;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface AIRequestOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  stream?: boolean;
}

export interface SelectedJob {
  id:           string | number;
  customerName: string;
  address:      string;
  description:  string;
  tech:         string;
  phase:        string;
}

export interface TodayJobSummary {
  id:           string;
  customerName: string;
  site:         string;
  phase:        string;
  status:       string;
  tech?:        string;
  startTime?:   string;
  serviceType?: string;
}

export interface CrewMemberSummary {
  id:     string;
  name:   string;
  role:   string;
  skills: string[];
  phone?: string | null;
  emergencyContact?: boolean;
}

export interface ScheduleJobSummary {
  id:            string;
  customerName:  string;
  site:          string;
  phase:         string;
  status:        string;
  serviceType?:  string;
  startDate:     string;
  endDate:       string;
  crew:          string[];
}

export interface SOLIDCOREContext {
  activeJobs?:        number;
  techsOnDuty?:       string[];
  pendingDispatches?: number;
  currentPage?:       string;
  selectedJob?:       SelectedJob | null;
  openJobsToday?:     TodayJobSummary[];
  totalJobsToday?:    number;
  currentDateTime?:   string;
  todayDate?:         string;
  /** Upcoming schedule window for the AI (server still loads live DB). */
  scheduleWindow?:    ScheduleJobSummary[];
  /** Crew roster with known abilities. */
  crewRoster?:        CrewMemberSummary[];
}

export interface AIChatResult {
  reply: string;
  didMutate?: boolean;
  toolsUsed?: string[];
}

export interface AIProviderConfig {
  provider: AIProvider;
  label:    string;
  model:    string;
  color:    string;
  icon:     string;
}

export const AI_PROVIDER_CONFIGS: Record<AIProvider, AIProviderConfig> = {
  gemini: {
    provider: 'gemini',
    label:    'Gemini',
    model:    'gemini-2.5-flash',
    color:    'text-blue-400',
    icon:     '✦',
  },
  copilot: {
    provider: 'copilot',
    label:    'Copilot',
    model:    'gpt-4o',
    color:    'text-purple-400',
    icon:     '⬡',
  },
};

export interface IAIProvider {
  provider: AIProvider;
  sendMessage(
    messages: AIMessage[],
    context:  SOLIDCOREContext,
    options?: AIRequestOptions
  ): Promise<AIChatResult>;
}