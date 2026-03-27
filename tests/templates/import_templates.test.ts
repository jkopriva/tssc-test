import { Component } from '../../src/rhtap/core/component';
import { createBasicFixture } from '../../src/utils/test/fixtures';
import { Environment } from '../../src/rhtap/core/integration/cd/argocd';
import { GitType } from '../../src/rhtap/core/integration/git/gitInterface';
import { expect } from '@playwright/test';

/**
 * Create a basic test fixture with testItem
 */
const test = createBasicFixture();

/**
 * Import flow: scaffold app → strip catalog/.tekton → unregister catalog → import-repo task
 * (inputUrl = source repo; publish creates `{name}-reimport` repos — same repo name would fail on GitHub).
 *
 * Runs serially: prerequisites are the same as other E2E tests (`npm run generate-config`, `.env`, cluster access).
 * Which suites run is controlled by `testplan.json` / `TESTPLAN_NAME`, not by extra env vars in this file.
 */
test.describe.serial('Import Template Tests', () => {
  test.setTimeout(300000);

  let component: Component;
  let importedComponent: Component;

  /** Set once after golden-path component exists (rhopp: lazy init at describe scope). */
  let componentName: string;
  let sourceRepoOwner: string;
  let sourceGitType: GitType;

  /** Set once after import-repo creates the publish component. */
  let importedRepoName: string;
  let importedRepoOwner: string;
  let importedGitType: GitType;

  test(`creates component from plan template (golden-path scaffold)`, async ({ testItem }) => {
    const baseName = testItem.getName();

    if (!baseName || baseName === 'undefined' || baseName.trim() === '') {
      throw new Error(`Invalid testItem name: "${baseName}". TestItem may not be properly initialized.`);
    }

    componentName = `${baseName}-import`;
    const imageName = `${componentName}`;
    console.log(
      `Creating component: ${componentName} (template=${testItem.getTemplate()}, baseName=${baseName})`
    );

    try {
      component = await Component.new(componentName, testItem, imageName);

      expect(component).toBeDefined();
      expect(component.getName()).toBe(componentName);

      const sourceGit = component.getGit();
      sourceRepoOwner = sourceGit.getRepoOwner();
      sourceGitType = sourceGit.getGitType();

      console.log(`Component ${componentName} created successfully`);
    } catch (error) {
      console.error(`❌ Failed to create component: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  });

  test(`waits for golden-path scaffold task to complete`, async () => {
    await component.waitUntilComponentIsCompleted();
    console.log(`Component ${componentName} creation completed`);
  });

  test(`waits for argocd sync after golden-path scaffold`, async () => {
    test.slow();

    const git = component.getGit();
    const commitSha = await git.getGitOpsRepoCommitSha();
    const cd = component.getCD();

    const result = await cd.waitUntilApplicationIsSynced(Environment.DEVELOPMENT, commitSha);
    expect(result.synced).toBe(true);
    console.log(`ArgoCD application for ${componentName} is synced and healthy`);
  });

  test(`verifies scaffolded source repo exists and has catalog-info.yaml`, async () => {
    const git = component.getGit();

    const repositoryExists = await git.checkIfRepositoryExists(sourceRepoOwner, componentName);
    expect(repositoryExists).toBe(true);

    const catalogFileExists = await git.checkIfFileExistsInRepository(sourceRepoOwner, componentName, 'catalog-info.yaml');
    expect(catalogFileExists).toBe(true);

    console.log(`Repository ${componentName} and catalog-info.yaml verified in ${sourceGitType}`);
  });

  test(`deletes catalog file and tekton folder`, async () => {
    const git = component.getGit();

    await git.deleteFolderInRepository(sourceRepoOwner, componentName, '.tekton');
    await git.deleteFileInRepository(sourceRepoOwner, componentName, 'catalog-info.yaml');

    console.log(`Deleted .tekton and catalog-info.yaml from ${componentName} in ${sourceGitType}`);
  });

  test(`deletes location from backstage`, async () => {
    const developerHub = component.getDeveloperHub();

    const entitySelector = `kind=Component,name=${componentName}`;

    const deleted = await developerHub.deleteEntitiesBySelector(entitySelector);
    expect(deleted).toBeTruthy();
    console.log(`Deleted entities for ${componentName} from Developer Hub`);
  });

  test(`runs import-repo scaffolder task`, async ({ testItem }) => {
    const expectedPublishName = `${componentName}-reimport`;

    try {
      importedComponent = await Component.importFromExistingRepository(component, testItem);

      expect(importedComponent).toBeDefined();
      expect(importedComponent.getName()).toBe(expectedPublishName);

      importedRepoName = importedComponent.getName();
      const importGit = importedComponent.getGit();
      importedRepoOwner = importGit.getRepoOwner();
      importedGitType = importGit.getGitType();

      console.log(`import-repo task queued; publish repos ${expectedPublishName}(, -gitops)`);
    } catch (error) {
      console.error(`❌ Failed to run import-from-repo task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  });

  test(`waits for imported component to be finished`, async () => {
    await importedComponent.waitUntilComponentIsCompleted();
    console.log(`Imported component ${importedRepoName} creation completed`);
  });

  test(`waits for imported component argocd to be synced in the cluster`, async () => {
    test.slow();

    const git = importedComponent.getGit();
    const commitSha = await git.getGitOpsRepoCommitSha();
    const cd = importedComponent.getCD();

    const result = await cd.waitUntilApplicationIsSynced(Environment.DEVELOPMENT, commitSha);
    expect(result.synced).toBe(true);
    console.log(`ArgoCD application for imported ${importedRepoName} is synced and healthy`);
  });

  test(`verifies publish repo has catalog-info.yaml`, async () => {
    const git = importedComponent.getGit();

    const repositoryExists = await git.checkIfRepositoryExists(importedRepoOwner, importedRepoName);
    expect(repositoryExists).toBe(true);

    const catalogFileExists = await git.checkIfFileExistsInRepository(importedRepoOwner, importedRepoName, 'catalog-info.yaml');
    expect(catalogFileExists).toBe(true);

    console.log(`Repository ${importedRepoName} after import-from-repo and catalog-info.yaml verified in ${importedGitType}`);
  });
});
