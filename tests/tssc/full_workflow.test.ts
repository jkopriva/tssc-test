import { Component } from '../../src/rhtap/core/component';
import { ArgoCD, Environment } from '../../src/rhtap/core/integration/cd/argocd';
import { CI, Pipeline } from '../../src/rhtap/core/integration/ci';
import { Git } from '../../src/rhtap/core/integration/git';
import { TPA } from '../../src/rhtap/core/integration/tpa';
import { ComponentPostCreateAction } from '../../src/rhtap/postcreation/componentPostCreateAction';
import {
  createComponentAndWaitForCompletion,
  runAndWaitforAppSync,
  handleSourceRepoCodeChanges,
  handlePromotionToEnvironmentandGetPipeline,
  getSbomIDFromCIPipelineLogs,
  searchSBOMByNameAndDocIdList
} from '../../src/utils/test/common';
import { createBasicFixture } from '../../src/utils/test/fixtures';
import { expect } from '@playwright/test';

/**
 * Create a basic test fixture with testItem and logger
 */
const test = createBasicFixture();
 // Apply serial mode to entire file                                                                                                                                                                                                                                                                                
test.describe.configure({ mode: 'serial' });  
/**
 * A complete test scenario for TSSC workflow:
 *
 * This test suite follows a full component lifecycle through:
 * 1. Component creation and verification
 * 2. Source repo changes and pipeline execution
 * 3. Promotion across environments (dev → stage → prod)
 * 4. Verification of deployments in all environments
 * 5. SBOM validation in Trustification server
 */
test.describe('TSSC Complete Workflow', () => {
  // Shared variables for test steps
  let component: Component;
  let cd: ArgoCD;
  let ci: CI;
  let git: Git;
  let image: string = '';
  let promotionPipelineInfo: Pipeline;
  const sbomDocumentIdList: string[] = [];

  test.describe('Component Creation', () => {
    test('should create a component successfully', async ({ testItem, logger }) => {
      // Generate initial component name directly in the test
      const componentName = testItem.getName();
      logger.info(`Creating component with retry support. Initial name: ${componentName}`);

      // Create the component and wait for completion with automatic retry
      component = await createComponentAndWaitForCompletion(testItem, {
        maxRetries: 2,
        retryDelayMs: 10000,
        regenerateNameOnRetry: true
      });

      logger.info(`Component created successfully with name: ${component.getName()}`);

      // Initialize shared resources
      cd = component.getCD();
      git = component.getGit();
      ci = component.getCI();

      // Verify component status
      const componentStatus = await component.getStatus();
      expect(componentStatus).toBe('completed');
      logger.info('Component was created successfully!');

      // Wait for initial CI deployment to sync
      await component.waitUntilInitialDeploymentIsSynced();
      console.log('✅ Initial CI deployment synced successfully!');

      // Execute post-creation actions
      const postCreateAction = new ComponentPostCreateAction(component);
      await postCreateAction.execute();
      logger.info('✅ Post-creation actions executed successfully!');

      // It is possible to trigger multiple pipelines when a new component is created and make some changes 
      // to the both source and gitops repos. These pipelines are not needed for the test and should be cancelled.
      await ci.cancelAllPipelines();
      logger.info('All initial pipelines have ended!');
    });
  });

  test.describe('Build Application Image', () => {
    test('should build application changes as new image through pipelines', async ({ logger }) => {
      // Handle source code changes based on CI provider type
      await handleSourceRepoCodeChanges(git, ci);
      logger.info('Source code changes processed successfully!');
    });
  });

  test.describe('Deployment Verification', () => {
    test('should verify deployment to development environment', async ({ logger }) => {
      // Verify application exists in development environment
      const application = await cd.getApplication(Environment.DEVELOPMENT);
      expect(application).not.toBeNull();

      // Get latest git commit and sync application
      const commitSha = await git.getGitOpsRepoCommitSha();

       // Verify sync was successful
      const syncResult = await runAndWaitforAppSync(cd, Environment.DEVELOPMENT, commitSha);
      expect(syncResult).toBe(true);
      logger.info('Application deployed correctly in the development environment!');
    });

    test('should promote and verify deployment to stage environment', async ({ logger }) => {
      // Extract the image from development
      image = await git.extractApplicationImage(Environment.DEVELOPMENT);
      expect(image).toBeTruthy();

      // Promote to stage environment
      promotionPipelineInfo = await handlePromotionToEnvironmentandGetPipeline(git, ci, cd, Environment.STAGE, image);
      logger.info('Image promoted to stage environment successfully!');

      // Get Sbom Document ID from promotion pipeline logs
      sbomDocumentIdList.push(await getSbomIDFromCIPipelineLogs(ci, promotionPipelineInfo));
    });

    test('should promote and verify deployment to production environment', async ({ logger }) => {
      // Extract the image from stage
      image = await git.extractApplicationImage(Environment.STAGE);
      expect(image).toBeTruthy();

      // Promote to production environment
      promotionPipelineInfo = await handlePromotionToEnvironmentandGetPipeline(git, ci, cd, Environment.PROD, image);
      logger.info('Image promoted to production environment successfully!');

      // Get Sbom Document ID from promotion pipeline logs
      sbomDocumentIdList.push(await getSbomIDFromCIPipelineLogs(ci, promotionPipelineInfo));
    });
  });

  test.describe('Security and Compliance', () => {
    test('should verify SBOM is uploaded to Trustification server', async ({ logger }) => {
      // Skip if no image to verify
      test.skip(!image, 'No image available to verify SBOM');

      // Skip if no SBOM documentID to verify
      test.skip(!sbomDocumentIdList.length, 'No SBOM document ID available to verify SBOM');

      // Extract image digest from image URL
      const imageDigest = image.split('@')[0];
      expect(imageDigest).toBeTruthy();

      // Get TPA instance and search for SBOM
      const tpa = await TPA.initialize(component.getKubeClient());
      const sbom = await searchSBOMByNameAndDocIdList(tpa, imageDigest, sbomDocumentIdList);

      // Verify SBOM results exist
      expect(sbom).toBe(true);
      logger.info(`SBOM verification successful! Found SBOM for image: ${imageDigest}`);
    });
  });
});
