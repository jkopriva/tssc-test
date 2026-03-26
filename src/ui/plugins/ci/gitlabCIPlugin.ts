import { expect, Page } from '@playwright/test';
import { BaseCIPlugin } from './baseCIPlugin';
import { GitPO } from '../../page-objects/commonPo';
import { LoggerFactory, Logger } from '../../../logger/logger';

export class GitlabCIPlugin extends BaseCIPlugin {
    private readonly logger: Logger = LoggerFactory.getLogger('GitlabCIPlugin');

    constructor(name: string, registryOrg: string) {
        super(name, registryOrg);
    }

    // eslint-disable-next-line no-unused-vars
    public async checkActions(_page: Page): Promise<void> {
        // GitLab CI pipeline runs are shown in the main table, no additional actions needed
    }

    public async checkPipelineRunsTable(page: Page): Promise<void> {
        const overviewUrl = page.url().replace(/\/ci(?:\?.*)?$/, '');
        await page.goto(overviewUrl, { timeout: 20000 });
        await page.waitForLoadState('domcontentloaded');

        const viewSourceLink = page.locator(`${GitPO.gitlabLinkSelector}:has-text("${GitPO.viewSourceLinkText}")`);
        await expect(viewSourceLink).toBeVisible({ timeout: 20000 });

        const repoUrl = await viewSourceLink.getAttribute('href');
        if (!repoUrl) {
            throw new Error('Missing repository URL on View Source link');
        }

        const gitlabPagePromise = page.context().waitForEvent('page', { timeout: 10000 });
        await viewSourceLink.click();
        const gitlabPage = await gitlabPagePromise;

        try {
            await gitlabPage.waitForLoadState('domcontentloaded');

            const pipelinesUrl = this.buildPipelinesUrl(repoUrl);
            await gitlabPage.goto(pipelinesUrl, { timeout: 20000, waitUntil: 'domcontentloaded' });

            await expect(gitlabPage).toHaveURL(pipelinesUrl, { timeout: 20000 });
        } finally {
            await gitlabPage.close();
        }
    }

    private buildPipelinesUrl(repoUrl: string): string {
        const url = new URL(repoUrl);
        // Strip branch path (e.g. /-/tree/main or /-/blob/main) to get the repo root
        const repoPath = url.pathname.replace(/\/-\/.+$/, '');
        return `${url.origin}${repoPath}/-/pipelines`;
    }

    // eslint-disable-next-line no-unused-vars
    public async checkImageRegistryLinks(_page: Page): Promise<void> {
        this.logger.info('Skipping checkImageRegistryLinks - not applicable for GitLab CI');
    }
}
