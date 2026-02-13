/**
 * Highlight Calculator
 * Determines visual styling for Call Activities based on active filters
 */

export interface FilterState {
  systems: string[];
  regions: string[];
  controls: string[];
  criticalOperations: string[];
}

export interface HighlightStyle {
  border?: {
    color: string;
    width: number;
  };
  overlay?: {
    html: string;
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  };
  fill?: string;
}

interface ProcessData {
  id: string;
  process_name: string;
  regions?: string[] | null;
  systems?: Array<{ id: string; system_name: string }>;
  controls?: Array<{ id: string }>;
  criticalOperations?: Array<{ id: string }>;
}

/**
 * Calculate highlighting styles for a Call Activity based on active filters
 */
export function calculateHighlighting(
  processId: string | null,
  processData: ProcessData | undefined,
  filters: FilterState
): HighlightStyle {
  if (!processId || !processData) {
    return {};
  }

  const styles: HighlightStyle = {};
  const hasActiveFilters =
    filters.systems.length > 0 ||
    filters.regions.length > 0 ||
    filters.controls.length > 0 ||
    filters.criticalOperations.length > 0;

  if (!hasActiveFilters) {
    return styles;
  }

  // Priority: Critical Operations > Controls > Systems > Regions
  // (Border color is determined by highest priority match)

  // Check Critical Operations (RED border - highest priority)
  if (filters.criticalOperations.length > 0) {
    const matchesCriticalOp = processData.criticalOperations?.some(co =>
      filters.criticalOperations.includes(co.id)
    );

    if (matchesCriticalOp) {
      styles.border = { color: '#ef4444', width: 4 };
    }
  }

  // Check Controls (BLUE border - second priority)
  if (!styles.border && filters.controls.length > 0) {
    const matchesControl = processData.controls?.some(ctrl =>
      filters.controls.includes(ctrl.id)
    );

    if (matchesControl) {
      styles.border = { color: '#3b82f6', width: 4 };
    }
  }

  // Check Systems (GREEN border - third priority)
  if (!styles.border && filters.systems.length > 0) {
    const matchesSystem = processData.systems?.some(sys =>
      filters.systems.includes(sys.id)
    );

    if (matchesSystem) {
      styles.border = { color: '#10b981', width: 4 };
    }
  }

  // Check Regions (OVERLAY - independent of border)
  if (filters.regions.length > 0 && processData.regions) {
    const matchedRegions = processData.regions.filter(region =>
      filters.regions.includes(region)
    );

    if (matchedRegions.length > 0) {
      styles.overlay = {
        html: createRegionBadge(matchedRegions),
        position: 'top-right'
      };
    }
  }

  return styles;
}

/**
 * Create HTML for region badge overlay
 */
function createRegionBadge(regions: string[]): string {
  const badges = regions.map(region =>
    `<span class="region-badge">${escapeHtml(region)}</span>`
  ).join('');

  return `<div class="region-badges">${badges}</div>`;
}

/**
 * Get filter match summary for a process
 */
export function getFilterMatchSummary(
  processData: ProcessData | undefined,
  filters: FilterState
): {
  matchesSystems: boolean;
  matchesRegions: boolean;
  matchesControls: boolean;
  matchesCriticalOps: boolean;
  hasAnyMatch: boolean;
} {
  if (!processData) {
    return {
      matchesSystems: false,
      matchesRegions: false,
      matchesControls: false,
      matchesCriticalOps: false,
      hasAnyMatch: false
    };
  }

  const matchesSystems = filters.systems.length > 0 &&
    (processData.systems?.some(sys => filters.systems.includes(sys.id)) ?? false);

  const matchesRegions = filters.regions.length > 0 &&
    (processData.regions?.some(region => filters.regions.includes(region)) ?? false);

  const matchesControls = filters.controls.length > 0 &&
    (processData.controls?.some(ctrl => filters.controls.includes(ctrl.id)) ?? false);

  const matchesCriticalOps = filters.criticalOperations.length > 0 &&
    (processData.criticalOperations?.some(co => filters.criticalOperations.includes(co.id)) ?? false);

  return {
    matchesSystems,
    matchesRegions,
    matchesControls,
    matchesCriticalOps,
    hasAnyMatch: matchesSystems || matchesRegions || matchesControls || matchesCriticalOps
  };
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
