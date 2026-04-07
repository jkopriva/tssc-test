import { expect, Locator, Page } from '@playwright/test';
import { BaseCIPlugin } from './baseCIPlugin';
import { JenkinsPO } from '../../page-objects/jenkinsPo';

/**
 * Jenkins CI Plugin for verifying Jenkins UI on the CI tab
 */
export class JenkinsPlugin extends BaseCIPlugin {
    constructor(name: string, registryOrg: string) {
        super(name, registryOrg);
    }

    /**
     * Check that the Jenkins heading/tab is visible
     */
    public async checkCIHeading(page: Page): Promise<void> {
        const logo = page.getByAltText(JenkinsPO.jenkinsLogoAlt);
        await expect(logo).toBeVisible();
        
        const logoBox = await logo.boundingBox();
        expect(logoBox).not.toBeNull();

        const projectsHeading = page.getByRole('heading', { name: JenkinsPO.projectsHeading, exact: true });
        await expect(projectsHeading).toBeVisible();

        const jenkinsTab = page.getByRole('tab', { name: JenkinsPO.jenkinsTabName });
        await expect(jenkinsTab).toBeVisible();
    }

    /**
     * Check the Projects table content
     */
    public async checkActions(page: Page): Promise<void> {
        const projectsTable = page.locator('table').filter({ has: page.getByText(JenkinsPO.sourceColumn) }).first();
        await expect(projectsTable).toBeVisible();

        for (const column of JenkinsPO.projectsTableColumns) {
            await expect(projectsTable.getByText(column, { exact: true })).toBeVisible();
        }

        // Check table has rows
        const rows = projectsTable.locator('tbody tr').filter({ hasText: this.name });
        await expect(rows.first()).toBeVisible();

        const firstRow = rows.first();

        // Check Source column
        await expect(firstRow).toContainText(JenkinsPO.branchRefPrefix);
        
        // Check Build column
        const buildLink = firstRow.getByRole('link').filter({ hasText: this.name }).first();
        await expect(buildLink).toBeVisible();
        await expect(buildLink).toHaveAttribute('href', /\/ci/);

        // Check Status column
        await expect(firstRow.getByTestId(JenkinsPO.statusOkTestId)).toBeVisible();
        await expect(firstRow).toContainText(JenkinsPO.completedStatus);

        // Check Last Run Duration column
        await expect(firstRow.getByText(/\d+(\.\d+)?\s*s/)).toBeVisible();

        // Check Actions column
        await this.checkActionsColumn(firstRow);
    }

    /**
     * Check the Actions column buttons
     */
    private async checkActionsColumn(row: Locator): Promise<void> {
        const viewBuildLink = row.getByTitle(JenkinsPO.viewBuildTitle);
        await expect(viewBuildLink).toBeVisible();
        await expect(viewBuildLink).toHaveAttribute('href');

        const rerunButton = row.getByTitle(JenkinsPO.rerunBuildTitle);
        await expect(rerunButton).toBeVisible();

        const viewRunsLink = row.getByTitle(JenkinsPO.viewRunsTitle);
        await expect(viewRunsLink).toBeVisible();
    }

    /**
     * Check the Pipeline Runs table in Security Information section
     */
    public async checkPipelineRunsTable(page: Page): Promise<void> {
        const securityHeading = page.getByRole('heading', { name: JenkinsPO.securityInfoHeading });
        await expect(securityHeading).toBeVisible();

        const jenkinsTab = page.getByRole('tab', { name: JenkinsPO.jenkinsTabName });
        await jenkinsTab.click();

        const pipelineTable = page.locator('table').filter({ has: page.getByText(JenkinsPO.pipelineRunIdColumn) });
        await expect(pipelineTable).toBeVisible();

        for (const column of JenkinsPO.pipelineRunsColumns) {
            await expect(pipelineTable.getByText(column, { exact: true })).toBeVisible();
        }

        const rows = pipelineTable.locator('tbody tr').filter({ hasText: this.name });
        await expect(rows.first()).toBeVisible();

        const firstRow = rows.first();
        await expect(firstRow).toContainText(this.name);
        await expect(firstRow).toContainText(JenkinsPO.buildType);
    }

    /**
     * Check build details page when clicking on a build link
     */
    public async checkBuildDetails(page: Page): Promise<void> {
        const projectsTable = page.locator('table').filter({ has: page.getByText(JenkinsPO.sourceColumn) }).first();
        const rows = projectsTable.locator('tbody tr').filter({ hasText: this.name });
        const firstRow = rows.first();
        
        const buildLink = firstRow.locator('td').nth(1).getByRole('link');
        await expect(buildLink).toBeVisible();
        
        const currentUrl = page.url();
        await buildLink.click();
        await page.waitForURL(/\/ci\/builds\//);
        await page.goto(currentUrl);
    }
}
