/**
 * Jenkins Page Objects
 * 
 * Contains locators and constants for Jenkins CI UI elements
 */

export const JenkinsPO = {
    // Header
    projectsHeading: 'Projects',
    jenkinsLogoAlt: 'Jenkins logo',
    
    // Projects table columns
    sourceColumn: 'Source',
    projectsTableColumns: ['Source', 'Build', 'Tests', 'Status', 'Last Run Duration', 'Actions'],
    
    // Source column content
    branchRefPrefix: 'refs/remotes/origin/',
    
    // Status
    statusOkTestId: 'status-ok',
    completedStatus: 'Completed',
    
    // Actions
    viewBuildTitle: 'View build',
    rerunBuildTitle: 'Rerun build',
    viewRunsTitle: 'View Runs',
    refreshDataTitle: 'Refresh Data',
    
    // Security Information
    securityInfoHeading: 'Security Information',
    jenkinsTabName: 'Jenkins',
    
    // Pipeline Runs table columns
    pipelineRunIdColumn: 'Pipeline Run ID',
    pipelineRunsColumns: ['Pipeline Run ID', 'Type', 'Critical', 'Important', 'Moderate', 'Low', 'SBOM', 'Actions'],
    
    // Pipeline types
    buildType: 'Build',
    
    // Test IDs
    pipelineRunToolbarInputTestId: 'pipeline-run-toolbar-input',
    pipelineRunPaginationTestId: 'pipeline-run-pagination',
};
