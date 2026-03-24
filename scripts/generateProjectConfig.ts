#!/usr/bin/env ts-node

import { TestPlan } from '../src/playwright/testplan';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { LoggerFactory } from '../src/logger/logger';
import type { Logger } from '../src/logger/logger';

interface ProjectConfig {
  name: string;
  testItem: any; // JSON representation of TestItem
}

/**
 * Standalone script to generate project configurations before Playwright runs
 * This ensures consistent TestItem instances across all test executions
 */
function generateProjectConfig(): void {
  // Initialize logger for the script
  const logger: Logger = LoggerFactory.getLogger('generateProjectConfig');

  try {
    // Load test plan
    const testPlanPath = process.env.TESTPLAN_PATH || path.resolve(process.cwd(), 'testplan.json');
    logger.info(`Using test plan: ${testPlanPath}`);
    
    if (!existsSync(testPlanPath)) {
      throw new Error(`Test plan file not found: ${testPlanPath}`);
    }

    const testPlanData = JSON.parse(readFileSync(testPlanPath, 'utf-8'));
    const testPlan = new TestPlan(testPlanData);

    // Check if we have multiple test plans and if a specific plan is requested
    const requestedPlan = process.env.TESTPLAN_NAME;
    let projectConfigs: any[];
    let requestedPlans: string[] = [];

    if (requestedPlan && testPlan.getTestPlans().length > 0) {
      // New format: filter by specific test plan(s) - support comma-separated values
      requestedPlans = requestedPlan.split(',').map(name => name.trim()).filter(name => name.length > 0);
      logger.info(`Filtering test items for plan(s): ${requestedPlans.join(', ')}`);
      const allConfigs = testPlan.getProjectConfigs();
      projectConfigs = allConfigs.filter(c => requestedPlans.includes(c.testItem.getPlanName()));
    } else {
      // Generate all project configurations (legacy behavior or all plans)
      projectConfigs = testPlan.getProjectConfigs();
    }

    logger.info(`Generated ${projectConfigs.length} project configurations`);

    // Log test plan information
    if (testPlan.getTestPlans().length > 0) {
      logger.info(`Available test plans: ${testPlan.getTestPlanNames().join(', ')}`);
      if (requestedPlan) {
        logger.info(`Using test plan: ${requestedPlan}`);
      } else {
        logger.info('Using all test plans (no TESTPLAN_NAME specified)');
      }
    } else {
      logger.info('Using legacy single test plan format');
    }

    // Prepare serialized configurations
    const serializedConfigs: ProjectConfig[] = projectConfigs.map(config => ({
      name: config.name,
      testItem: config.testItem.toJSON()
    }));

    // Ensure output directory exists
    const outputPath = './tmp/project-configs.json';
    const outputDir = path.dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Write configurations to file
    writeFileSync(outputPath, JSON.stringify(serializedConfigs, null, 2));

    // Also generate a summary for verification
    const summary = {
      generatedAt: new Date().toISOString(),
      testPlanPath,
      totalConfigurations: projectConfigs.length,
      requestedPlan: requestedPlan || 'all',
      availableTestPlans: testPlan.getTestPlanNames(),
      testFiltering: {
        tests: requestedPlan ? testPlan.getTestsForPlans(requestedPlans) : testPlan.getTests(),
        testMatchPattern: requestedPlan ? testPlan.getTestMatchPatternsForPlans(requestedPlans) : testPlan.getTestMatchPattern(),
        testMatchPatterns: requestedPlan ? testPlan.getTestMatchPatternsForPlans(requestedPlans) : testPlan.getTestMatchPatterns()
      },
      testItems: projectConfigs.map(config => ({
        name: config.testItem.getName(),
        template: config.testItem.getTemplate(),
        git: config.testItem.getGitType(),
        ci: config.testItem.getCIType(),
        registry: config.testItem.getRegistryType()
      }))
    };

    writeFileSync('./tmp/project-config-summary.json', JSON.stringify(summary, null, 2));
    
    // Log test filtering information
    const testsToShow = requestedPlan ? testPlan.getTestsForPlans(requestedPlans) : testPlan.getTests();
    const testMatchPattern = requestedPlan ? testPlan.getTestMatchPatternsForPlans(requestedPlans) : testPlan.getTestMatchPattern();
    logger.info(`Test filtering: ${testsToShow.length > 0 ? testsToShow.join(', ') : 'All tests'}`);
    logger.info(`Test match pattern: ${testMatchPattern}`);
    logger.info('Project configuration generation completed successfully!');

  } catch (error) {
    logger.error(`Failed to generate project configurations: ${error}`);
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  generateProjectConfig();
}

export { generateProjectConfig }; 