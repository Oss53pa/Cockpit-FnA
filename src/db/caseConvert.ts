/** Shared camelCase ↔ snake_case converters for Supabase ↔ Dexie */

const CAMEL_TO_SNAKE: Record<string, string> = {
  orgId: 'org_id', periodId: 'period_id', fiscalYearId: 'fiscal_year_id',
  syscoCode: 'sysco_code', importId: 'import_id', fileHash: 'file_hash',
  fileName: 'file_name', createdAt: 'created_at', updatedAt: 'updated_at',
  completedAt: 'completed_at', resolvedAt: 'resolved_at', detectedAt: 'detected_at',
  accountingSystem: 'accounting_system', startDate: 'start_date', endDate: 'end_date',
  sourceCode: 'source_code', targetCode: 'target_code',
  analyticalAxis: 'analytical_axis', analyticalSection: 'analytical_section',
  storagePath: 'storage_path', attentionPointId: 'attention_point_id',
  detectedBy: 'detected_by', targetResolutionDate: 'target_resolution_date',
  estimatedFinancialImpact: 'estimated_financial_impact',
  impactDescription: 'impact_description', rootCause: 'root_cause',
  lastReviewedAt: 'last_reviewed_at', resolvedNote: 'resolved_note',
  dueDate: 'due_date', reviewDate: 'review_date',
  budgetAllocated: 'budget_allocated', resourcesNeeded: 'resources_needed',
  successCriteria: 'success_criteria', estimatedImpact: 'estimated_impact',
  codeName: 'code_name', shortLabel: 'short_label', longLabel: 'long_label',
  parentId: 'parent_id', axisId: 'axis_id', previousHash: 'previous_hash',
  userName: 'user_name', isDefault: 'is_default', isActive: 'is_active',
};

export function toSnake(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const mapped = CAMEL_TO_SNAKE[k];
    if (mapped) { out[mapped] = v; }
    else { out[k.replace(/([A-Z])/g, '_$1').toLowerCase()] = v; }
  }
  return out;
}

export function toCamel(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const ck = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (k === 'user_name') out.user = v;
    else out[ck] = v;
  }
  return out;
}
