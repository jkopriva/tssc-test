export const DEFAULT_APP_NAMESPACE = 'tssc-app';

export const TSSC_APP_DEPLOYMENT_NAMESPACE = process.env.TSSC_APP_DEPLOYMENT_NAMESPACE || DEFAULT_APP_NAMESPACE;

export const TSSC_CI_NAMESPACE = `${TSSC_APP_DEPLOYMENT_NAMESPACE}-ci`;

// Path to the project configs file (shared between config generator, E2E and UI tests)
export const PROJECT_CONFIGS_FILE = './tmp/project-configs.json';
