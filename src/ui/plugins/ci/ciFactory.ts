import { CIPlugin } from './ciPlugin';
import { CIType } from '../../../rhtap/core/integration/ci/ciInterface';
import { TektonPlugin } from './tektonPlugin';
import { LoggerFactory } from '../../../logger/logger';
import type { Logger } from '../../../logger/logger';
import { GithubActionsPlugin } from './githubActionsPlugin';
import { AzurePlugin } from './azurePlugin';
import { GitlabCIPlugin } from './gitlabCIPlugin';

export class CIFactory {
    private static readonly logger: Logger = LoggerFactory.getLogger(CIFactory);

    /**
    * Creates a CI UI plugin instance based on the CI type.
     *
     * @param name - The name of the component
     * @param ciType - The type of CI provider
     * @returns A Promise resolving to the appropriate CIPlugin instance
     * @throws Error if the CI type is not supported
     */
    static async createCiPlugin(
        name: string,
        registryOrg: string,
        ciType: CIType,
    ): Promise<CIPlugin | undefined> {
        switch (ciType) {
            case CIType.TEKTON:
                return new TektonPlugin(name, registryOrg);
            case CIType.GITHUB_ACTIONS:
                return new GithubActionsPlugin(name, registryOrg);
            case CIType.AZURE:
                return new AzurePlugin(name, registryOrg);
            case CIType.GITLABCI:
                return new GitlabCIPlugin(name, registryOrg);
            default:
                this.logger.warn(`Unsupported CI type: ${ciType}`);
                return undefined;
        }
    }
}
