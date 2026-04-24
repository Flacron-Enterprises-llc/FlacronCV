import {
  CRMCustomerStatus,
  CRMLeadStage,
  CRMTransactionStatus,
  CRMCustomerSource,
  CRMActivityType,
} from './enums';

// ─── Core Entities ───────────────────────────────────────────────────────────

export interface CRMNote {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
}

export interface CRMCustomer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  status: CRMCustomerStatus;
  tags: string[];
  totalRevenue: number;
  source: CRMCustomerSource;
  notes: CRMNote[];
  lastActivity: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CRMLead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  source: CRMCustomerSource;
  stage: CRMLeadStage;
  assignedTo: string | null;
  assignedToName: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CRMTransaction {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  currency: string;
  paymentMethod: string | null;
  description: string | null;
  date: Date;
  status: CRMTransactionStatus;
  createdAt: Date;
}

export interface CRMActivity {
  id: string;
  customerId: string;
  type: CRMActivityType;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  authorId: string;
  authorName: string;
  createdAt: Date;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface CRMMonthlyComparison {
  customers: number; // % change vs last month
  revenue: number;
  leads: number;
}

export interface CRMAnalyticsOverview {
  totalCustomers: number;
  activeCustomers: number;
  newCustomersThisMonth: number;
  totalRevenue: number;
  monthlyRevenue: number;
  totalLeads: number;
  conversionRate: number; // % of leads converted to customers
  avgRevenuePerCustomer: number;
  thisMonthVsLastMonth: CRMMonthlyComparison;
}

export interface CRMRevenueDataPoint {
  month: string; // e.g. "Jan 2025"
  revenue: number;
  transactions: number;
}

export interface CRMCustomerGrowthDataPoint {
  month: string;
  customers: number;
  leads: number;
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface CreateCRMCustomerDto {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  status?: CRMCustomerStatus;
  source?: CRMCustomerSource;
  tags?: string[];
}

export interface UpdateCRMCustomerDto {
  name?: string;
  phone?: string;
  company?: string;
  status?: CRMCustomerStatus;
  tags?: string[];
  source?: CRMCustomerSource;
}

export interface CreateCRMLeadDto {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  source?: CRMCustomerSource;
  stage?: CRMLeadStage;
  assignedTo?: string;
  assignedToName?: string;
  notes?: string;
}

export interface UpdateCRMLeadDto {
  name?: string;
  phone?: string;
  company?: string;
  stage?: CRMLeadStage;
  assignedTo?: string;
  assignedToName?: string;
  notes?: string;
}

export interface CreateCRMTransactionDto {
  customerId: string;
  customerName: string;
  amount: number;
  currency?: string;
  paymentMethod?: string;
  description?: string;
  date?: string; // ISO string
  status?: CRMTransactionStatus;
}

export interface AddCRMNoteDto {
  content: string;
}

// ─── Query Params ─────────────────────────────────────────────────────────────

export interface CRMCustomerListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: CRMCustomerStatus;
  source?: CRMCustomerSource;
  sortBy?: 'name' | 'createdAt' | 'totalRevenue' | 'lastActivity';
  sortOrder?: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
}

export interface CRMLeadListParams {
  page?: number;
  limit?: number;
  search?: string;
  stage?: CRMLeadStage;
  assignedTo?: string;
}

export interface CRMTransactionListParams {
  page?: number;
  limit?: number;
  customerId?: string;
  status?: CRMTransactionStatus;
  startDate?: string;
  endDate?: string;
}

// ─── Platform Users ───────────────────────────────────────────────────────────

export interface PlatformUserItem {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  role: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
  cvsCreated: number;
  coverLettersCreated: number;
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  exportsThisMonth: number;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date;
  location: string;
}

export interface PlatformUserListParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  plan?: string;
  isActive?: boolean;
  sortBy?: 'createdAt' | 'lastLoginAt' | 'displayName' | 'cvsCreated';
  sortOrder?: 'asc' | 'desc';
}

export interface UpdateCRMUserRoleDto {
  role: string;
}

export interface UpdateCRMUserPlanDto {
  plan: string;
  status?: string;
}

// ─── Platform Analytics ───────────────────────────────────────────────────────

export interface PlatformAnalyticsOverview {
  totalUsers: number;
  activeUsers: number;
  newUsersThisMonth: number;
  usersByPlan: { free: number; pro: number; enterprise: number };
  totalCVs: number;
  totalCoverLetters: number;
  cvsThisMonth: number;
  coverLettersThisMonth: number;
  avgCVsPerUser: number;
  avgCoverLettersPerUser: number;
  thisMonthVsLastMonth: { users: number; cvs: number; coverLetters: number };
}

export interface PlatformUserGrowthDataPoint {
  month: string;
  users: number;
  activeUsers: number;
}

export interface PlatformUsageDataPoint {
  month: string;
  cvs: number;
  coverLetters: number;
}

export interface PlatformTopTemplate {
  templateId: string;
  name: string;
  usageCount: number;
  category: string;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
  details: Record<string, unknown>;
}

export interface AuditLogListParams {
  page?: number;
  limit?: number;
  action?: string;
  actorId?: string;
  targetType?: string;
  startDate?: string;
  endDate?: string;
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export interface AppSettingsPlanLimits {
  cvsLimit: number;
  coverLettersLimit: number;
  aiCreditsLimit: number;
  exportsLimit: number;
}

export interface AppSettings {
  planLimits: {
    free: AppSettingsPlanLimits;
    pro: AppSettingsPlanLimits;
    enterprise: AppSettingsPlanLimits;
  };
  featureFlags: {
    aiEnabled: boolean;
    templatesEnabled: boolean;
    exportsEnabled: boolean;
    coverLettersEnabled: boolean;
  };
  maintenanceMode: {
    enabled: boolean;
    message: string;
  };
  announcement: {
    enabled: boolean;
    message: string;
    type: 'info' | 'warning' | 'success' | 'danger';
  };
  updatedAt: Date | null;
  updatedBy: string | null;
}

export interface UpdateAppSettingsDto {
  planLimits?: Partial<AppSettings['planLimits']>;
  featureFlags?: Partial<AppSettings['featureFlags']>;
  maintenanceMode?: Partial<AppSettings['maintenanceMode']>;
  announcement?: Partial<AppSettings['announcement']>;
}
