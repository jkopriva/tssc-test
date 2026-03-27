# TSSC E2E Testing Framework and Tests

## Table of Contents
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
  - [Test Filtering](#test-filtering)
  - [Multiple Test Plans](#multiple-test-plans-new-format)
- [Running Tests](#running-tests)
- [UI Tests](#ui-tests)
- [Development](#development)

## Overview

This project is an end-to-end automation testing framework designed to validate the functionality of the [Red Hat Trusted Software Supply Chain CLI](https://github.com/redhat-appstudio/tssc-cli) (tssc). Built with Playwright and TypeScript, this framework simulates real-world user interactions and backend processes to ensure the reliability and correctness of tssc's core features.


## Test Execution Control


### Environment Variables

- **`TESTPLAN_PATH`** (default: `./testplan.json`) - Path to the test plan configuration file
- **`TESTPLAN_NAME`** - Name of specific test plan(s) to run (supports comma-separated values for multiple test plans)
- **`UI_DEPENDS_ON_ALL_E2E`** (default: `false`) - Controls UI test dependency behavior
  - When `false`: Each UI test depends only on its corresponding E2E test
  - When `true`: All UI tests depend on ALL E2E tests (sequential execution)

### Usage Examples

```bash
# Run tests based on test plan content (automatic detection)
npm test

# Run E2E tests only (uses automatic detection)
npm run test:e2e

# Run UI tests only (forces UI test execution)
npm run test:ui

# Run all tests (E2E + UI)
npm run test:all

# Run tests with custom test plan path
TESTPLAN_PATH=./custom-testplan.json npm test

# Run specific test plan from custom path
TESTPLAN_PATH=./custom-testplan.json TESTPLAN_NAME=backend-tests npm test

# Run multiple test plans
TESTPLAN_NAME=backend-tests,ui-tests npm test

```

### Test Dependencies

- **When both are enabled**: UI tests depend on their corresponding E2E tests (by default)
  - With `UI_DEPENDS_ON_ALL_E2E=true`: UI tests depend on ALL E2E tests. Even when a single E2E test fails, all UI tests are skipped.
  - With `UI_DEPENDS_ON_ALL_E2E=false`: Each UI test depends only on its corresponding E2E test.
- **When only UI enabled**: UI tests run standalone using existing project configurations
- **When only E2E enabled**: Only backend tests run with fresh configurations

### Configuration Generation

Configuration generation is controlled by the `generate-config` script. This script will read testplan.json file and generate project configurations for each test combination in `./tmp/project-configs.json` file.

* Running only E2E tests (`npm run test:e2e`) or both E2E and UI  tests (`npm run test:all`) will generate fresh project configurations.
* Running only UI tests (`npm run test:ui`) will use existing project configurations from previous E2E runs or hand-crafted project configurations in `./tmp/project-configs.json` file.

## Prerequisites

Before using this testing framework, ensure you have:

* An OpenShift cluster with tssc installed and properly configured (Enable `debug/ci=true`)
* **For Local Test Execution:**
  * Node.js (v20+)
  * ArgoCD CLI installed
* **For Container Test Execution:**
  * Podman

## Configuration

### Step 1: Configure Test Plan

Copy the `testplan.json` template from the templates directory to the root directory:

```bash
cp templates/testplan.json .
```

The testplan.json file supports defining multiple TSSC combinations, allowing you to test different configurations in parallel.

#### File Structure
```json
{
  "templates": ["go", "python", "nodejs", "dotnet-basic", "java-quarkus", "java-springboot"],
  "tssc": [
    {
      "git": "github",
      "ci": "tekton",
      "registry": "quay",
      "tpa": "remote",
      "acs": "local"
    },
    {
      "git": "gitlab",
      "ci": "tekton",
      "registry": "quay",
      "tpa": "remote",
      "acs": "local"
    }
  ],
  "tests": ["test1", "test2"]
}
```

#### Configuration Fields

- **`templates`**: Array of application templates to test
  - Valid values: `["go", "python", "nodejs", "dotnet-basic", "java-quarkus", "java-springboot"]`

- **`tssc`**: Array of TSSC configuration objects, each containing:
  - `git`: Git provider - `["github", "gitlab", "bitbucket"]`
  - `ci`: CI provider - `["tekton", "jenkins", "gitlabci", "githubactions", "azure"]`
  - `registry`: Image registry - `["quay","artifactory", "nexus"]`
  - `acs`: ACS configuration - `["local", "remote"]`
  - `tpa`: TPA configuration - `["local", "remote"]`

- **`tests`**: Array of test identifiers - test filtering functionality

#### Test Execution Matrix

The framework creates a test matrix by combining each template with each TSSC configuration. For example, with the above configuration:
- **Templates**: 6 (go, python, nodejs, dotnet-basic, java-quarkus, java-springboot)
- **TSSC combinations**: 2 (github+tekton+quay, gitlab+tekton+quay)
- **Total tests**: 6 × 2 = 12 test combinations

Each test combination runs independently, allowing you to validate different technology stacks across various TSSC configurations.

#### Test Filtering

The framework supports test filtering through the `tests` array in `testplan.json`. This allows you to run only specific tests or test categories, improving test execution efficiency and reducing runtime.

**Filtering Options:**

- **Folder-based filtering**: Specify test directories to run
  ```json
  {
    "tests": ["ui", "tssc"]
  }
  ```

- **File-based filtering**: Specify individual test files
  ```json
  {
    "tests": ["component.test.ts", "workflow.test.ts"]
  }
  ```

- **Mixed filtering**: Combine folders and specific files
  ```json
  {
    "tests": ["ui", "component.test.ts", "tssc/workflow.test.ts"]
  }
  ```

**How Test Filtering Works:**

1. **Pattern Matching**: The framework converts test identifiers into Playwright-compatible match patterns
2. **Directory Matching**: `"ui"` becomes `"ui/**/*.test.ts"`
3. **File Matching**: `"component.test.ts"` matches files with that exact name
4. **Path Matching**: `"tssc/workflow.test.ts"` matches specific file paths

**Examples:**

```json
{
  "templates": ["go", "python"],
  "tssc": [
    {
      "git": "github",
      "ci": "tekton",
      "registry": "quay",
      "tpa": "remote",
      "acs": "local"
    }
  ],
  "tests": ["ui", "tssc"]
}
```

This configuration will:
- Generate 2 test combinations (go + github, python + github)
- Run only tests in the `ui/` and `tssc/` directories
- Skip any tests outside these directories

#### Multiple Test Plans (New Format)

The framework also supports multiple test plans in a single `testplan.json` file, allowing you to organize tests by different scenarios or environments.

**Multiple Test Plans Structure:**
```json
{
  "testPlans": [
    {
      "name": "github-tests",
      "templates": ["go", "python"],
      "tssc": [
        {
          "git": "github",
          "ci": "tekton",
          "registry": "quay",
          "tpa": "remote",
          "acs": "local"
        }
      ],
      "tests": ["full_workflow.test.ts"]
    },
    {
      "name": "gitlab-tests",
      "templates": ["go", "python"],
      "tssc": [
        {
          "git": "gitlab",
          "ci": "tekton",
          "registry": "quay",
          "tpa": "remote",
          "acs": "local"
        }
      ],
      "tests": ["full_workflow.test.ts"]
    },
    {
      "name": "bitbucket-tests",
      "templates": ["go", "python"],
      "tssc": [
        {
          "git": "bitbucket",
          "ci": "tekton",
          "registry": "quay",
          "tpa": "remote",
          "acs": "local"
        }
      ],
      "tests": ["full_workflow.test.ts"]
    }
  ]
}
```

**Multiple Test Plans Fields:**

- **`testPlans`**: Array of individual test plan configurations
- **`name`**: Unique identifier for each test plan
- **`templates`**: Application templates specific to each test plan
- **`tssc`**: TSSC configurations specific to each test plan
- **`tests`**: Test filtering specific to each test plan

**Running Specific Test Plans:**

You can run specific test plans using the `TESTPLAN_NAME` environment variable:

```bash
# Run only the github-tests plan
TESTPLAN_NAME=github-tests npm test

# Run all test plans (default behavior)
npm test
```


### Step 2: Configure Environment Variables

Copy the template file from [templates/.env](templates/.env) to the root directory:

```bash
cp templates/.env .env
```

Edit the `.env` file to set required environment variables for running automation tests. Below are the key variables you need to configure:

#### Required Variables (E2E Tests)

Image Registry Configuration:
- `QUAY_REGISTRY_ORG` - Organization name for Quay.io registry
- `ARTIFACTORY_REGISTRY_ORG` - Organization name for Artifactory registry (if using Artifactory)
- `NEXUS_REGISTRY_ORG` - Organization name for Nexus registry (if using Nexus)

Git Provider Configuration:
- `GITHUB_ORGANIZATION` - GitHub organization name (required when using GitHub as git provider)
- `BITBUCKET_WORKSPACE` - Bitbucket workspace name (required when using Bitbucket)
- `BITBUCKET_PROJECT` - Bitbucket project key (required when using Bitbucket)

CI Provider Configuration:
- `AZURE_PROJECT` - Azure DevOps project name (required when using Azure Pipelines as CI)

#### Optional Variables (E2E Tests)

Component Configuration:
- `TSSC_APP_DEPLOYMENT_NAMESPACE` - Custom deployment namespace (default: `tssc-app`). Update this if you have modified the default `developerHub: namespacePrefixes` during the installation process.

Multi CI Testing:
- `CI_TEST_RUNNER_IMAGE` - Container image to use as the CI runner/builder, overriding the default image in generated component CI configuration files (for eg., .github/workflows, .gitlab-ci.yml, azure-pipeline.yml)


#### UI Test Variables (Required for UI tests)

GitHub UI Authentication:
- `GH_USERNAME` - GitHub username for UI login
- `GH_PASSWORD` - GitHub password for UI login
- `GH_SECRET` - GitHub 2FA secret


After editing the file, source it before running tests:

```bash
source .env
```

### Step 3: (Optional) Skip TLS Verification

For testing environments with self-signed certificates or invalid SSL certificates, you can disable TLS verification globally. This is useful in testing environments but should not be used in production:

```bash
# Option 1: Set environment variable before running tests
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Option 2: Add to your .env file
echo "NODE_TLS_REJECT_UNAUTHORIZED=0" >> .env
```

## Running Tests

### Option 1: Local Test Execution

#### Install Dependencies
```bash
npm install
```

#### Run Tests
```bash
# Run tests based on test plan content (automatic workflow detection)
npm test

# Run E2E tests only (uses automatic detection)
npm run test:e2e

# Run UI tests only (forces UI test execution)
npm run test:ui

# Run all tests (E2E + UI)
npm run test:all

# Run a specific test file
npm test -- tests/tssc/full_workflow.test.ts

# Run tests with custom test plan path
TESTPLAN_PATH=./custom-testplan.json npm test

# Run specific test plan (multiple test plans format)
TESTPLAN_NAME=e2e-tests npm test

# Run multiple test plans
TESTPLAN_NAME=e2e-tests,ui-tests npm test

# Run specific test plan from custom path
TESTPLAN_PATH=./custom-testplan.json TESTPLAN_NAME=e2e-tests npm test

# Force UI test execution
ENABLE_UI_TESTS=true npm test

# Run import template tests (same prerequisites as other E2E: .env, kubeconfig, `npm run generate-config` via the script below)
npm run test:import

# View test report
npm run test:report
```

### Option 2: Container Test Execution

You also can run tests in a container using Podman, which provides a consistent testing environment.

#### Build Container Image
```bash
podman build -t tssc-test:latest .
```

#### Start Interactive Container

Prepare your configuration files:
- `testplan.json` - Test plan configuration
- `.env` - Environment variables
- `kubeconfig` - Kubernetes configuration file

Start an interactive shell in the container:

```bash
podman run -it --rm \
  -v "$(pwd)/testplan.json:/tssc-test/testplan.json:ro" \
  -v "$(pwd)/.env:/tssc-test/.env:ro" \
  -v "$(pwd)/kubeconfig:/tssc-test/.kube/config:ro" \
  -v "$(pwd)/test-results:/tssc-test/playwright-report" \
  tssc-test:latest /bin/bash
```

#### Run Tests Inside Container

Once inside the container, you can execute any test commands:

```bash
# Source environment variables
source .env

# Run all tests
npm run test:all

# Run a specific test file
npm test -- tests/tssc/full_workflow.test.ts

# Run specific test plan (multiple test plans format)
TESTPLAN_NAME=github-tests npm test

# Run UI tests
npm run test:ui

# Run import template tests (same prerequisites as other E2E; use `import-tests` plan or `npm run test:backend` for e2e + import)
npm run test:import

# View test report
npm run test:report

# Run validation commands
npm run validate
```

**Volume Mounts:**
- `testplan.json` - Your test configuration (read-only)
- `.env` - Environment variables file (read-only)
- `kubeconfig` - Kubernetes configuration (read-only)
- `test-results` - Test results and artifacts (read-write)
- `test-logs` - Application logs (read-write)

## Test Reports

After test execution, Playwright automatically generates an html formated report under playwright-report directory and JUnit files.


## UI Tests

The framework includes UI automation tests that validate the RHADS SSC user interface using Playwright. These tests ensure the correct functionality of the web interface and its integration with various plugins and backend services. For high-level overview, please see [UI tests design](docs/UI_TESTS_DESIGN.md).

### Prerequisites for UI Tests

- Complete all backend test setup steps above
- Component should be created manually or during backend tests
- Set UI-specific variables in the `.env` file
- Setup Github app for UI testing (see [Github App UI Setup](docs/GITHUB_APP_UI_SETUP.md))

### Running UI Tests

#### Local Execution
```bash
# Run UI tests in console
npm run test:ui

# Run UI tests in UI mode (interactive)
npm run test:ui-interactive
```

#### Container Execution
```bash
# Inside the container
npm run test:ui
```

**Note:** UI mode (`npm run test:ui-interactive`) opens the Playwright UI interface and allows developers to see test execution and UI behavior, read the DOM, watch page networking, etc. This mode is only available for local execution.

### UI Test Structure

The UI tests are organized as follows:

- `src/ui/plugins/` - UI-specific automation for various plugins (Git providers, CI providers, image registries, etc.)
- `src/ui/page-objects/` - Page Object Models (POMs) for UI elements
- `tests/ui/` - UI test automation suites

### Naming convention

All UI related files should be placed to the `/src/ui` or `/tests/ui` directories. To distinguish UI entities from backend ones, it's required to include `Ui` or `plugin` to the name of the entity.

Page object identifiers are located in the `/src/ui/page-objects` directory. Each file should have a `Po.ts` suffix.

Plugin-related functionality is stored in the `/src/ui/plugins` directory, organized by plugin's type - for example, `git` or `ci`. The file name should match the short name of a plugin. Classes defined in these files must include either `Ui` or `plugin` in their names.

### UI Test Artifacts

UI tests save screenshots and videos to the same directories as the backend E2E tests.

### Security concerns

There are several secrets mounted to the code as environmental variables. It's important to make sure that no secrets are leaking in logs or screenshots. When you use a secret in a test, please make sure that:
- the secret is not printed in the logs
- the input field where secret is written is blurred:

```
const inputFieldLocator = page.locator(fieldPO);
await inputFieldLocator.evaluate((el) => el.style.filter = 'blur(5px)');
```

- the logging level is lower then TRACE (trace level catches for example also network requests, which usually contains also secrets)
## Development

### High-level Architecture
![Architecture Diagram](./docs/images/Hight_level_Arch.jpg)

### Development Commands

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format

# Type check
npm run check-types

# Run all validation steps
npm run validate
```

### Test Filtering Development

When developing new test filtering functionality, you can test the filtering logic:

```bash
# Test with specific test patterns
npm test -- --grep "ui"

# Test with directory filtering
npm test -- tests/ui

# Test with file filtering
npm test -- tests/component.test.ts
```


### Debugging

#### VS Code Debugging

For VS Code users, you can debug tests directly in the editor using the provided launch configuration template.

**Setup VS Code Debugging:**

1. Copy the launch configuration template:
```bash
cp templates/launch.json .vscode/launch.json
```

2. The launch.json template contains a configuration for debugging specific test files

3. **Customize the configuration:**
   - Change the test file path in `args` array to debug different test files
   - Modify `--headed` to `--headless` for headless debugging
   - Add additional Playwright options as needed

4. **Start debugging:**
   - Open the test file you want to debug
   - Set breakpoints in your code
   - Go to VS Code's Debug view (Ctrl+Shift+D)
   - Select "Debug specific test file" from the dropdown
   - Click the play button or press F5

**Debug Different Test Files:**
- For full workflow tests: `tests/tssc/full_workflow.test.ts`
- For UI tests: `tests/tssc/ui.test.ts`
