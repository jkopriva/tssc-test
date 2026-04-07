import { createBasicFixture } from '../../src/utils/test/fixtures';
import { existsSync } from 'fs';
import { UiComponent } from '../../src/ui/uiComponent';
import { CommonPO } from '../../src/ui/page-objects/commonPo';
import { hideQuickStartIfVisible } from '../../src/ui/commonUi';
import { waitForPageLoad } from '../../src/ui/commonUi';
import { AUTH_STORAGE_FILE } from '../../playwright.config';
import { GithubActionsPlugin } from '../../src/ui/plugins/ci/githubActionsPlugin';
import { GithubUiPlugin } from '../../src/ui/plugins/git/githubUi';
import { Git, GitType } from '../../src/rhtap/core/integration/git';
import { getDeveloperHubConfig } from '../../src/utils/util';
import { ArgoCDPlugin } from '../../src/ui/plugins/cd/argocdPlugin';
import { ArgocdPO } from '../../src/ui/page-objects/argocdPo';

/**
 * Create a basic test fixture with testItem
 */
const test = createBasicFixture();

/**
 * A complete test scenario for RHTAP UI plugins test:
 *
 * This test suite check the plugin in the UI and uses the component from backend e2e test.
 * This test intentionally does not:
 * 1. Login to the UI (done by auth-setup.ts)
 * 2. Check the gitops resource (done by gitopsResource.test.ts)
 * TODO:
 * 3. Check the ArgoCD integration on the Overview page
 * 4. Check the CI integration and existing pipelines
 * 5. Check the CD tab and verify information shown
 * 6. Check the Image Registry tab and verify information shown
 */
test.describe('Component UI Test Suite', () => {
  // Skip the entire UI suite if auth storage state is missing
  test.beforeAll(async () => {
    if (!existsSync(AUTH_STORAGE_FILE)) {
      test.skip(true, 'Authentication setup was skipped or failed; skipping dependent UI tests');
    }
  });

  // Shared variables for test steps
  let component: UiComponent;

  test.beforeAll(async ({ testItem }) => {
    console.log('Running UI test for component:', testItem.getName());
    const componentName = testItem.getName();
    console.log(`Creating component: ${componentName}`);

    // Assign the already created component
    component = await UiComponent.new(componentName, testItem, componentName);
  });

  test.describe('Go to home page', () => {
    test('open developer hub', async ({ page }) => {
      await page.goto(component.getCoreComponent().getDeveloperHub().getUrl(), {
        timeout: 20000,
      });
      await page
        .getByRole('heading', { name: CommonPO.welcomeTitle })
        .waitFor({ state: 'visible', timeout: 20000 });
    });
  });

  test.describe("Verify Git", () => {
    test('verify "View Source" link', async ({ page }) => {
      // Skip test for not yet supported git providers
      if (component.getGit() === undefined) {
        console.warn(`Skipping Git test as testing ${component.getCoreComponent().getGit().getGitType()} is not supported`);
        test.skip();
        return;
      }

      await page.goto(component.getComponentUrl(), { timeout: 20000 });
      await waitForPageLoad(page, component.getCoreComponent().getName());

      await test.step('Check Git Source link', async () => {
        await component.getGit()!.checkViewSourceLink(page);
      }, { timeout: 20000 });
    });
  });

  test.describe("Verify CI", () => {
    test('verify CI provider on CI tab', async ({ page }) => {
      const ciPlugin = component.getCI();

      if (ciPlugin === undefined) {
        console.warn(`Skipping CI test as testing ${component.getCoreComponent().getCI().getCIType()} is not supported`);
        test.skip();
        return;
      }

      // Navigate to CI tab
      await page.goto(`${component.getComponentUrl()}/ci`, { timeout: 20000 });

      // Login to GitHub if the CI provider is GitHub Actions and the sign in page is not GitHub
      if (ciPlugin instanceof GithubActionsPlugin && (await getDeveloperHubConfig()).signInPage !== GitType.GITHUB) {
        const githubUI = new GithubUiPlugin({} as Git);
        await githubUI.login(page);
      }

      await waitForPageLoad(page, component.getCoreComponent().getName());

      await test.step('Hide Quick start side panel', async () => {
        await hideQuickStartIfVisible(page);
      }, { timeout: 20000 });

      await test.step('Check CI heading', async () => {
        await ciPlugin.checkCIHeading(page);
      }, {timeout: 20000});

      await test.step('Check CI table content', async () => {
        await ciPlugin!.checkActions(page);
      }, {timeout: 40000});

      await test.step('Check Pipeline Runs table row values', async () => {
        await ciPlugin!.checkPipelineRunsTable(page);
      }, { timeout: 30000 });

      await test.step('Check image registry links in View Output popup', async () => {
        await ciPlugin!.checkImageRegistryLinks(page);
      }, { timeout: 40000 });
    });
  });

  test.describe("Verify CD", () => {
    test('verify ArgoCD deployment lifecycle', async ({ page }) => {
      const argocdPlugin = new ArgoCDPlugin(component.getCoreComponent().getName());

      // Navigate to Overview page
      await page.goto(`${component.getComponentUrl()}`, { timeout: 20000 });
      await waitForPageLoad(page, component.getCoreComponent().getName());

      await test.step('Hide Quick start side panel', async () => {
        await hideQuickStartIfVisible(page);
      }, { timeout: 20000 });

      await test.step('Check Deployment Summary table', async () => {
        await argocdPlugin.checkDeploymentSummary(page);
      }, { timeout: 30000 });

      // Navigate to CD tab
      await page.goto(`${component.getComponentUrl()}/cd`, { timeout: 20000 });
      await waitForPageLoad(page, component.getCoreComponent().getName());

      await test.step('Hide Quick start side panel', async () => {
        await hideQuickStartIfVisible(page);
      }, { timeout: 30000 });

      await test.step('Check Deployment Lifecycle heading', async () => {
        await argocdPlugin.checkPageHeading(page);
      }, { timeout: 30000 });

      await test.step('Check environment cards', async () => {
        for (const environment of ArgocdPO.environments) {
          await argocdPlugin.checkEnvironmentCard(page, environment);
        }
      }, { timeout: 60000 });

      await test.step('Check environment drawers', async () => {
        for (const environment of ArgocdPO.environments) {
          await argocdPlugin.checkDrawerContent(page, environment);
        }
      }, { timeout: 60000 });
    });
  });

  test.describe("Verify Docs", () => {
    test('test docs', async ({ page }) => {
      const docsPlugin = component.getDocs();

      // Navigate to docs page
      await page.goto(`${component.getComponentUrl()}/docs`, {
        timeout: 20000,
      });
      await waitForPageLoad(page, component.getCoreComponent().getName());

      // Hide Quick start side panel
      // WORKAROUND FOR: https://issues.redhat.com/browse/RHDHBUGS-1946
      await test.step('Hide Quick start side panel', async () => {
        await hideQuickStartIfVisible(page);
      }, { timeout: 20000 });

      await test.step('Check article display', async () => {
        await docsPlugin.checkArticle(page);
      }, {timeout: 60000});

      await test.step('Check component name', async () => {
        await docsPlugin.checkComponentName(page);
      }, {timeout: 20000});

      await test.step('Check source link', async () => {
        await docsPlugin.checkSourceLink(page);
      }, {timeout: 20000});

      await test.step('Check gitops link', async () => {
        await docsPlugin.checkGitopsLink(page);
      }, {timeout: 20000});
    });
  });

  test.describe('Test Image Registry', () => {
    test('test image registry', async ({ page }) => {
      const registryPlugin = component.getRegistry();

      if (registryPlugin === undefined) {
        console.warn(`Skipping Image Registry test as testing ${component.getCoreComponent().getRegistry().getRegistryType()} is not supported`);
        test.skip();
        return;
      }

      // Navigate to image registry page
      await page.goto(`${component.getComponentUrl()}/image-registry`, {
        timeout: 20000,
      });

      await test.step('Hide Quick start side panel', async () => {
        await hideQuickStartIfVisible(page);
      }, { timeout: 20000 });

      await test.step('Check repository heading', async () => {
        await registryPlugin.checkRepositoryHeading(page);
      }, { timeout: 20000 });

      await test.step('Check repository link', async () => {
        await registryPlugin.checkRepositoryLink(page);
      }, { timeout: 20000 });

      await test.step('Check search input field', async () => {
        await registryPlugin.checkSearchInputField(page);
      }, { timeout: 20000 });

      await test.step('Check table column headers', async () => {
        await registryPlugin.checkTableColumns(page);
      }, { timeout: 20000 });

      await test.step('Check image table content', async () => {
        await registryPlugin.checkImageTableContent(page);
      }, { timeout: 20000 });

      // The security scan is not yet finished right after installation
      // await test.step('Check vulnerabilities', async () => {
      //   await registryPlugin.checkVulnerabilities(page);
      // }, { timeout: 20000 });
    });
  });

  test.describe("Check dependencies tab and gitops dependency", () => {

    test('test dependency', async ({ page }) => {
      const dependencies = component.getDependencies();
      await page.goto(`${component.getComponentUrl()}/dependencies`, {
        timeout: 20000,
      });
      await waitForPageLoad(page, component.getCoreComponent().getName());

      await test.step('Check all boxes', async () => {
        await dependencies.checkAllBoxesPresent(page);
      }, {timeout: 30000});

      await test.step('Check nodes and go to gitops dependency', async () => {
        await dependencies.checkRelationsTitle(page);
        await dependencies.checkNodesPresent(page);
      }, {timeout: 30000});
    });
  });
});