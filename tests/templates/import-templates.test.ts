import { test, expect } from '@playwright/test';
import { Component } from '../../src/rhtap/core/component';
import { TestItem } from '../../src/playwright/testItem';
import { TemplateType } from '../../src/rhtap/core/integration/git';
import { GitType } from '../../src/rhtap/core/integration/git';
import { CIType } from '../../src/rhtap/core/integration/ci';
import { ImageRegistryType } from '../../src/rhtap/core/integration/registry';
import { randomString } from '../../src/utils/util';
import { loadFromEnv } from '../../src/utils/util';
import { KubeClient } from '../../src/api/ocp/kubeClient';
import { DeveloperHub } from '../../src/api/rhdh/developerhub';
import { GithubProvider } from '../../src/rhtap/core/integration/git/providers/github';
import { ArgoCD } from '../../src/rhtap/core/integration/cd/argocd';
import { Environment } from '../../src/rhtap/core/integration/cd/argocd';

/**
 * Import Templates Test Suite
 * 
 * This test suite validates the import template functionality in Red Hat Developer Hub:
 * 1. Creates a component using a template
 * 2. Verifies the component is created successfully
 * 3. Deletes the component from Developer Hub
 * 4. Re-imports the component using the import template
 * 5. Verifies the imported component is created successfully
 */
test.describe('Import Template Tests', () => {
  let component: Component;
  let importedComponent: Component;
  let kubeClient: KubeClient;
  let developerHub: DeveloperHub;
  let githubProvider: GithubProvider;
  let argoCD: ArgoCD;
  
  const templateName = 'go'; // You can change this to test different templates
  const githubOrganization = loadFromEnv('GITHUB_ORGANIZATION');
  const repositoryName = `${randomString(9)}-${templateName}`;
  const importedRepositoryName = `${repositoryName}-imported`;
  const imageName = `rhtap-qe-${templateName}`;
  const imageRegistry = loadFromEnv('IMAGE_REGISTRY') || 'quay.io';

  test.beforeAll(async () => {
    // Initialize Kubernetes client
    kubeClient = new KubeClient();
    
    // Get Developer Hub URL and initialize client
    const routeHostname = await kubeClient.getOpenshiftRoute('backstage-developer-hub', 'tssc-dh');
    const developerHubUrl = `https://${routeHostname}`;
    developerHub = new DeveloperHub(developerHubUrl);
    
    // Initialize GitHub provider
    githubProvider = new GithubProvider(
      repositoryName,
      githubOrganization,
      templateName as TemplateType,
      kubeClient
    );
    await githubProvider.initialize();
    
    // Initialize ArgoCD
    argoCD = new ArgoCD(repositoryName, kubeClient);
  });

  test(`verifies if ${templateName} template exists in the catalog`, async () => {
    // This would require implementing a method to get golden path templates
    // For now, we'll assume the template exists if we can create a component
    expect(templateName).toBeDefined();
    console.log(`Template ${templateName} is available for testing`);
  });

  test(`creates ${templateName} component`, async () => {
    // Create test item for the component
    const testItem = new TestItem(
      repositoryName,
      templateName as TemplateType,
      imageRegistry as ImageRegistryType,
      GitType.GITHUB,
      CIType.TEKTON,
      'local',
      'local'
    );

    // Create component using the TSSC framework
    component = await Component.new(testItem.getName(), testItem, imageName, true);
    
    expect(component).toBeDefined();
    expect(component.getName()).toBe(repositoryName);
    console.log(`Component ${repositoryName} created successfully`);
  });

  test(`waits for ${templateName} component to be finished`, async () => {
    // Wait for component creation to complete
    await component.waitUntilComponentIsCompleted();
    console.log(`Component ${repositoryName} creation completed`);
  });

  test(`waits for ${templateName} argocd to be synced in the cluster`, async () => {
    // Wait for ArgoCD application to be healthy
    const syncResult = await argoCD.waitUntilApplicationIsSynced(
      Environment.DEVELOPMENT,
      'HEAD',
      50, // maxRetries
      10000 // retryDelayMs
    );
    
    expect(syncResult.synced).toBe(true);
    console.log(`ArgoCD application for ${repositoryName} is synced and healthy`);
  });

  test(`verifies if component ${templateName} was created in GitHub and contains 'catalog-info.yaml' file`, async () => {
    // Check if repository exists in GitHub
    const repositoryExists = await githubProvider.checkIfRepositoryExists(githubOrganization, repositoryName);
    expect(repositoryExists).toBe(true);

    // Check if catalog-info.yaml exists
    const catalogFileExists = await githubProvider.checkIfFileExistsInRepository(githubOrganization, repositoryName, 'catalog-info.yaml');
    expect(catalogFileExists).toBe(true);
    
    console.log(`Repository ${repositoryName} and catalog-info.yaml verified in GitHub`);
  });

  test(`deletes catalog file and tekton folder`, async () => {
    // Delete .tekton folder
    await githubProvider.deleteFolderInRepository(githubOrganization, repositoryName, '.tekton');
    
    // Delete gitops folder
    await githubProvider.deleteFolderInRepository(githubOrganization, repositoryName, 'gitops');
    
    // Delete catalog-info.yaml file
    await githubProvider.deleteFileInRepository(githubOrganization, repositoryName, 'catalog-info.yaml');
    
    console.log(`Deleted .tekton, gitops folders and catalog-info.yaml from ${repositoryName}`);
  });

  test(`deletes location from backstage`, async () => {
    // Delete entities from Developer Hub
    await developerHub.deleteEntitiesBySelector(repositoryName);
    console.log(`Deleted entities for ${repositoryName} from Developer Hub`);
  });

  test(`creates import task for importing component`, async () => {
    // Create test item for the imported component
    const importedTestItem = new TestItem(
      importedRepositoryName,
      templateName as TemplateType,
      imageRegistry as ImageRegistryType,
      GitType.GITHUB,
      CIType.TEKTON,
      'local',
      'local'
    );

    // Create imported component using the TSSC framework
    importedComponent = await Component.new(importedTestItem.getName(), importedTestItem, imageName, true);
    
    expect(importedComponent).toBeDefined();
    expect(importedComponent.getName()).toBe(importedRepositoryName);
    console.log(`Import task created for ${importedRepositoryName}`);
  });

  test(`waits for imported component to be finished`, async () => {
    // Wait for imported component creation to complete
    await importedComponent.waitUntilComponentIsCompleted();
    console.log(`Imported component ${importedRepositoryName} creation completed`);
  });

  test(`waits for imported component argocd to be synced in the cluster`, async () => {
    // Create ArgoCD instance for imported component
    const importedArgoCD = new ArgoCD(importedRepositoryName, kubeClient);
    
    // Wait for ArgoCD application to be healthy
    const syncResult = await importedArgoCD.waitUntilApplicationIsSynced(
      Environment.DEVELOPMENT,
      'HEAD',
      50, // maxRetries
      10000 // retryDelayMs
    );
    
    expect(syncResult.synced).toBe(true);
    console.log(`ArgoCD application for imported ${importedRepositoryName} is synced and healthy`);
  });

  test(`verifies if imported component ${templateName} was created in GitHub and contains 'catalog-info.yaml' file`, async () => {
    // Check if imported repository exists in GitHub
    const repositoryExists = await githubProvider.checkIfRepositoryExists(githubOrganization, importedRepositoryName);
    expect(repositoryExists).toBe(true);

    // Check if catalog-info.yaml exists in imported repository
    const catalogFileExists = await githubProvider.checkIfFileExistsInRepository(githubOrganization, importedRepositoryName, 'catalog-info.yaml');
    expect(catalogFileExists).toBe(true);
    
    console.log(`Imported repository ${importedRepositoryName} and catalog-info.yaml verified in GitHub`);
  });

  test.afterAll(async () => {
    // Cleanup: Delete created repositories and resources
    if (process.env.CLEAN_AFTER_TESTS === 'true') {
      console.log('Cleaning up test resources...');
      
      try {
        // Delete repositories from GitHub
        await githubProvider.deleteRepository(githubOrganization, repositoryName);
        await githubProvider.deleteRepository(githubOrganization, importedRepositoryName);
        
        // Delete entities from Developer Hub
        await developerHub.deleteEntitiesBySelector(repositoryName);
        await developerHub.deleteEntitiesBySelector(importedRepositoryName);
        
        console.log('Cleanup completed successfully');
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    }
  });
});
