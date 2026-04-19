/**
 * DataProvider — couche d'abstraction entre l'app et le stockage.
 * Permet de basculer entre Dexie (local), Supabase (cloud) ou Electron (SQLite)
 * sans toucher au code métier.
 */
import type { Organization, FiscalYear, Period, Account, GLEntry, ImportLog, BudgetLine, ReportDoc, AttentionPoint, ActionPlan, AccountMapping, ReportTemplate } from './schema';

export interface GLFilter {
  orgId: string;
  periodId?: string;
  importId?: string | number;
  account?: string;
  fromDate?: string;
  toDate?: string;
}

export interface DataProvider {
  // Organizations
  getOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization | undefined>;
  upsertOrganization(org: Organization): Promise<void>;
  deleteOrganization(id: string): Promise<void>;

  // Fiscal years & Periods
  getFiscalYears(orgId: string): Promise<FiscalYear[]>;
  upsertFiscalYear(fy: FiscalYear): Promise<void>;
  getPeriods(orgId: string): Promise<Period[]>;
  upsertPeriod(p: Period): Promise<void>;

  // Accounts
  getAccounts(orgId: string): Promise<Account[]>;
  bulkUpsertAccounts(accounts: Account[]): Promise<void>;
  deleteAccounts(orgId: string): Promise<void>;

  // GL Entries
  getGLEntries(filter: GLFilter): Promise<GLEntry[]>;
  bulkInsertGL(entries: GLEntry[]): Promise<void>;
  deleteGLByImport(importId: number): Promise<void>;

  // Imports
  getImports(orgId: string): Promise<ImportLog[]>;
  addImport(log: Omit<ImportLog, 'id'>): Promise<number>;
  deleteImport(id: number): Promise<void>;

  // Budgets
  getBudgets(orgId: string, year: number, version: string): Promise<BudgetLine[]>;
  getAllBudgets(orgId: string): Promise<BudgetLine[]>;
  bulkUpsertBudgets(lines: BudgetLine[]): Promise<void>;
  deleteBudgets(orgId: string, year: number, version: string): Promise<void>;

  // Reports
  getReports(orgId: string): Promise<ReportDoc[]>;
  getReport(id: number): Promise<ReportDoc | undefined>;
  upsertReport(doc: Omit<ReportDoc, 'id'> & { id?: number }): Promise<number>;
  deleteReport(id: number): Promise<void>;

  // Templates
  getTemplates(orgId: string): Promise<ReportTemplate[]>;
  upsertTemplate(t: Omit<ReportTemplate, 'id'> & { id?: number }): Promise<number>;
  deleteTemplate(id: number): Promise<void>;

  // Attention points
  getAttentionPoints(orgId: string): Promise<AttentionPoint[]>;
  upsertAttentionPoint(p: Omit<AttentionPoint, 'id'> & { id?: number }): Promise<number>;
  deleteAttentionPoint(id: number): Promise<void>;

  // Action plans
  getActionPlans(orgId: string): Promise<ActionPlan[]>;
  upsertActionPlan(p: Omit<ActionPlan, 'id'> & { id?: number }): Promise<number>;
  deleteActionPlan(id: number): Promise<void>;

  // Mappings
  getMappings(orgId: string): Promise<AccountMapping[]>;
  upsertMapping(m: AccountMapping): Promise<void>;

  // File storage
  uploadFile(orgId: string, fileName: string, file: File | Blob): Promise<string>;
  downloadFile(path: string): Promise<Blob>;
}

// ─── Provider selection ─────────────────────────────────────────────
import { isSupabaseConfigured } from '../lib/supabase';
import { DexieProvider } from './dexieProvider';
import { SupabaseProvider } from './supabaseProvider';

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

function selectProvider(): DataProvider {
  if (isElectron) {
    // Sprint 6: Electron SQLite provider
    const { ElectronProvider } = require('./electronProvider');
    return new ElectronProvider();
  }
  if (isSupabaseConfigured) {
    return new SupabaseProvider();
  }
  return new DexieProvider();
}

export const dataProvider: DataProvider = selectProvider();
