/**
 * ArgoCD Page Objects
 * 
 * Contains locators and constants for ArgoCD Deployment Lifecycle UI elements
 */

export const ArgocdPO = {
    // Page headings
    deploymentLifecycleHeading: 'Deployment lifecycle',

    // Status chip test IDs
    syncStatusChipTestId: 'app-sync-status-chip',
    healthStatusChipTestId: 'app-health-status-chip',
    
    // Status icon test IDs
    syncedIconTestId: 'synced-icon',
    healthyIconTestId: 'healthy-icon',
    
    // Status labels
    syncedLabel: 'Synced',
    healthyLabel: 'Healthy',
    outOfSyncLabel: 'OutOfSync',
    degradedLabel: 'Degraded',
    
    // Card content labels
    instanceLabel: 'Instance',
    serverLabel: 'Server',
    namespaceLabel: 'Namespace',
    commitLabel: 'Commit',
    resourcesLabel: 'Resources',
    
    // Drawer content labels
    clusterLabel: 'Cluster',
    revisionLabel: 'Revision',
    closeDrawerTitle: 'Close the drawer',
    drawerSelector: '[class*="MuiDrawer-paper"]',
    
    // Cluster info
    localClusterTooltipTestId: 'local-cluster-tooltip',
    inClusterText: '(in-cluster)',

    // Resources table (in drawer)
    resourcesTableColumns: ['Name', 'Kind', 'Created at', 'Sync status', 'Health status'],

    // Deployment Summary table (on overview page)
    deploymentSummaryHeading: 'Deployment Summary',
    argocdAppColumn: 'ArgoCD App',
    deploymentSummaryColumns: ['ArgoCD App', 'Namespace', 'Instance', 'Server', 'Revision', 'Last deployed', 'Sync status', 'Health status'],

    // Commit SHA pattern (7-char hex)
    commitShaPattern: /^[a-f0-9]{7}$/i,

    // Environments
    environments: ['development', 'stage', 'prod'] as const,
};

/**
 * Returns card test ID for a specific component and environment
 */
export function getArgocdCardTestId(componentName: string, environment: string): string {
    return `${componentName}-${environment}-card`;
}

/**
 * Returns link test ID for a specific component and environment
 */
export function getArgocdLinkTestId(componentName: string, environment: string): string {
    return `${componentName}-${environment}-link`;
}
