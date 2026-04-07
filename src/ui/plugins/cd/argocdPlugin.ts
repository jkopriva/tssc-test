import { expect, Page, Locator } from '@playwright/test';
import { ArgocdPO, getArgocdCardTestId, getArgocdLinkTestId } from '../../page-objects/argocdPo';

/**
 * ArgoCD Plugin for verifying Deployment Lifecycle UI
 */
export class ArgoCDPlugin {
    private componentName: string;

    constructor(componentName: string) {
        this.componentName = componentName;
    }

    /**
     * Verifies the Deployment Lifecycle page heading
     */
    public async checkPageHeading(page: Page): Promise<void> {
        const heading = page.getByRole('heading', { name: ArgocdPO.deploymentLifecycleHeading });
        await expect(heading).toBeVisible();
    }

    /**
     * Verifies the Deployment Summary table on the overview page
     */
    public async checkDeploymentSummary(page: Page): Promise<void> {
        const heading = page.getByRole('heading', { name: ArgocdPO.deploymentSummaryHeading });
        await expect(heading).toBeVisible();

        const table = page.locator('table').filter({ has: page.getByText(ArgocdPO.argocdAppColumn) });
        await expect(table).toBeVisible();

        for (const column of ArgocdPO.deploymentSummaryColumns) {
            await expect(table.getByText(column, { exact: true })).toBeVisible();
        }

        const rows = table.locator('tbody tr').filter({ has: page.locator('td') });
        expect(await rows.count()).toBeGreaterThan(0);

        await this.checkDeploymentSummaryRows(table);
    }

    /**
     * Verifies that an environment card is displayed with correct information
     */
    public async checkEnvironmentCard(page: Page, environment: string): Promise<void> {
        const cardTestId = getArgocdCardTestId(this.componentName, environment);
        const card = page.getByTestId(cardTestId);

        await expect(card).toBeVisible();
        await expect(card).toContainText(`${this.componentName}-${environment}`);

        await this.checkExternalLink(card, environment);
        await this.checkSyncStatus(card);
        await this.checkHealthStatus(card);
        await this.checkCardContent(card);
    }

    /**
     * Verifies the drawer content after clicking a card
     */
    public async checkDrawerContent(page: Page, environment: string): Promise<void> {
        const drawer = await this.openCardDrawer(page, environment);

        await this.checkExternalLink(drawer, environment);
        await this.checkSyncStatus(drawer);
        await this.checkHealthStatus(drawer);
        await this.checkDrawerInfoContent(drawer);
        await this.checkResourcesTable(drawer);

        await this.closeDrawer(page);
    }

    /**
     * Verifies rows in the Deployment Summary table
     */
    private async checkDeploymentSummaryRows(table: Locator): Promise<void> {
        const rows = table.locator('tbody tr').filter({ hasText: this.componentName });

        for (const env of ArgocdPO.environments) {
            const appName = `${this.componentName}-${env}`;
            const row = rows.filter({ hasText: appName }).first();

            const appLink = row.getByRole('link').first();
            await expect(appLink).toContainText(appName);
            await expect(appLink).toHaveAttribute('href');

            const revisionLink = row.getByRole('link', { name: ArgocdPO.commitShaPattern });
            await expect(revisionLink).toHaveAttribute('href');

            await expect(row.getByTestId(ArgocdPO.syncedIconTestId)).toBeVisible();
            await expect(row.getByTestId(ArgocdPO.healthyIconTestId)).toBeVisible();
        }
    }

    /**
     * Verifies the ArgoCD external link is present
     */
    private async checkExternalLink(container: Locator, environment: string): Promise<void> {
        const linkTestId = getArgocdLinkTestId(this.componentName, environment);
        const link = container.getByTestId(linkTestId);
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href');
    }

    /**
     * Verifies sync status chip is displayed correctly
     */
    private async checkSyncStatus(container: Locator): Promise<void> {
        const syncChip = container.getByTestId(ArgocdPO.syncStatusChipTestId);
        await expect(syncChip).toBeVisible();
        await expect(container.getByTestId(ArgocdPO.syncedIconTestId).first()).toBeVisible();
        await expect(syncChip).toContainText(ArgocdPO.syncedLabel);
    }

    /**
     * Verifies health status chip is displayed correctly
     */
    private async checkHealthStatus(container: Locator): Promise<void> {
        const healthChip = container.getByTestId(ArgocdPO.healthStatusChipTestId);
        await expect(healthChip).toBeVisible();
        await expect(container.getByTestId(ArgocdPO.healthyIconTestId).first()).toBeVisible();
        await expect(healthChip).toContainText(ArgocdPO.healthyLabel);
    }

    /**
     * Verifies commit information is displayed correctly
     */
    private async checkCommitInfo(container: Locator): Promise<void> {
        const commitChip = container.getByTestId(/-commit-link$/).first();
        await expect(commitChip).toBeVisible();
        await expect(commitChip.getByText(ArgocdPO.commitShaPattern)).toBeVisible();

        const commitMessage = container.getByTestId(/-commit-message$/).first();
        await expect(commitMessage).toBeVisible();
    }

    /**
     * Verifies card content sections (Instance, Server, Namespace, Commit, Resources)
     */
    private async checkCardContent(card: Locator): Promise<void> {
        await expect(card.getByText(ArgocdPO.instanceLabel, { exact: true })).toBeVisible();
        await expect(card.getByText(ArgocdPO.serverLabel, { exact: true })).toBeVisible();
        await expect(card.getByText(ArgocdPO.namespaceLabel, { exact: true })).toBeVisible();
        await expect(card.getByText(ArgocdPO.commitLabel, { exact: true }).first()).toBeVisible();
        await this.checkCommitInfo(card);
        await expect(card.getByText(ArgocdPO.resourcesLabel, { exact: true })).toBeVisible();
        await expect(card.getByText(/\d+ resources? deployed/)).toBeVisible();
    }

    /**
     * Opens the drawer by clicking on a card
     */
    private async openCardDrawer(page: Page, environment: string): Promise<Locator> {
        const cardTestId = getArgocdCardTestId(this.componentName, environment);
        const card = page.getByTestId(cardTestId);
        await card.click();

        const expectedTitle = `${this.componentName}-${environment}`;
        const drawerHeading = page.getByRole('heading', { name: expectedTitle, exact: true });
        await expect(drawerHeading).toBeVisible();

        return page.locator(ArgocdPO.drawerSelector).filter({ has: drawerHeading });
    }

    /**
     * Closes the drawer
     */
    private async closeDrawer(page: Page): Promise<void> {
        const closeButton = page.getByTitle(ArgocdPO.closeDrawerTitle);
        await closeButton.click();
        await expect(closeButton).not.toBeVisible();
    }

    /**
     * Verifies drawer info content
     */
    private async checkDrawerInfoContent(drawer: Locator): Promise<void> {
        await expect(drawer.getByText(ArgocdPO.instanceLabel, { exact: true })).toBeVisible();
        await expect(drawer.getByText(ArgocdPO.clusterLabel, { exact: true })).toBeVisible();
        await expect(drawer.getByTestId(ArgocdPO.localClusterTooltipTestId)).toBeVisible();
        await expect(drawer.getByText(ArgocdPO.namespaceLabel, { exact: true })).toBeVisible();
        await expect(drawer.getByText(ArgocdPO.commitLabel, { exact: true })).toBeVisible();
        await this.checkCommitInfo(drawer);
        await expect(drawer.getByText(ArgocdPO.revisionLabel, { exact: true })).toBeVisible();
    }

    /**
     * Verifies the resources table in the drawer
     */
    private async checkResourcesTable(drawer: Locator): Promise<void> {
        await expect(drawer.getByText(ArgocdPO.resourcesLabel, { exact: true })).toBeVisible();

        const table = drawer.locator('table');
        await expect(table).toBeVisible();

        for (const column of ArgocdPO.resourcesTableColumns) {
            await expect(table.getByText(column, { exact: true })).toBeVisible();
        }

        const rows = table.locator('tbody tr').filter({ hasNot: drawer.locator('[colspan]') });
        expect(await rows.count()).toBeGreaterThan(0);

        const firstRow = rows.first();
        await expect(firstRow.getByTestId(/^expander-\d+$/)).toBeVisible();
        await expect(firstRow).toContainText(this.componentName);
        await expect(firstRow.getByTestId(ArgocdPO.syncedIconTestId)).toBeVisible();
        await expect(firstRow.getByTestId(ArgocdPO.healthyIconTestId)).toBeVisible();
    }
}
