import { GithubClient } from '../../../../../api/github';
import { KubeClient } from '../../../../../../src/api/ocp/kubeClient';
import { Environment } from '../../cd/argocd';
import { BaseGitProvider } from '../baseGitProvider';
import { GitType } from '../gitInterface';
import { PullRequest } from '../models';
import { ITemplate, TemplateFactory, TemplateType } from '../templates/templateFactory';
import sodium from 'sodium-native';
import { ContentModifications } from '../../../../modification/contentModification';
import { LoggerFactory, Logger } from '../../../../../logger/logger';

export class GithubProvider extends BaseGitProvider {
  private readonly logger: Logger;
  private githubClient!: GithubClient;
  private template!: ITemplate;
  private repoOwner: string;
  public constructor(
    componentName: string,
    repoOwner: string,
    templateType: TemplateType,
    kubeClient: KubeClient
  ) {
    super(componentName, GitType.GITHUB, kubeClient);
    this.logger = LoggerFactory.getLogger('rhtap.core.integration.git.github');
    this.repoOwner = repoOwner;
    this.template = TemplateFactory.createTemplate(templateType);
  }

  public async initialize(): Promise<void> {
    this.secret = await this.loadSecret();
    this.githubClient = await this.initGithubClient();
  }

  public getKubeClient(): KubeClient {
    return this.kubeClient;
  }
  /**
   * Loads GitHub integration secrets from Kubernetes
   * @returns Promise with the secret data
   */
  protected async loadSecret(): Promise<Record<string, string>> {
    const secret = await this.kubeClient.getSecret('tssc-github-integration', 'tssc');
    if (!secret) {
      throw new Error(
        'GitHub integration secret not found in the cluster. Please ensure the secret exists.'
      );
    }

    // Register the token with the factory so it can be shared

    return secret;
  }

  public getToken(): string {
    if (!this.secret?.token) {
      throw new Error('GitHub token not found in the secret. Please ensure the token is provided.');
    }
    return this.secret.token;
  }

  public getClientID(): string {
    if (!this.secret?.clientId) {
      throw new Error(
        'Client ID not found in the secret. Please ensure the client ID is provided.'
      );
    }
    return this.secret.clientId;
  }

  public getClientSecret(): string {
    if (!this.secret?.clientSecret) {
      throw new Error(
        'Client secret not found in the secret. Please ensure the client secret is provided.'
      );
    }
    return this.secret.clientSecret;
  }

  public getWebhookSecret(): string {
    if (!this.secret?.webhookSecret) {
      throw new Error(
        'Webhook secret not found in the secret. Please ensure the webhook secret is provided.'
      );
    }
    return this.secret.webhookSecret;
  }

  private async initGithubClient(): Promise<GithubClient> {
    const githubToken = this.getToken();
    return new GithubClient({ token: githubToken });
  }

  /**
   * Gets the template type for this repository
   * @returns The template type or null if not set
   */
  public getTemplateType(): TemplateType {
    return this.template.getType();
  }

  /**
   * Creates a sample pull request with modifications based on template type in the source repository
   *
   * @returns {Promise<PullRequest>} - Returns a PullRequest object with pull number, commit SHA, and URL
   */
  public override async createSamplePullRequestOnSourceRepo(): Promise<PullRequest> {
    const newBranchName = 'test-branch-' + Date.now();
    const title = 'Test PR from TSSC e2e test';
    const description = 'This PR was created automatically by the TSSC e2e test';
    const baseBranch = 'main'; // Default base branch

    // Get contentModifications from the template
    if (!this.template) {
      throw new Error('Template not set for this repository');
    }

    const contentModifications = this.template.getContentModifications();

    const result = await this.githubClient.pullRequests.createPullRequest(
      this.repoOwner,
      this.sourceRepoName,
      this.repoOwner,
      baseBranch,
      newBranchName,
      contentModifications,
      title,
      description
    );

    // Extract the pull number and commit SHA from the result
    const { prNumber, commitSha } = result;

    // Construct repository name for GitHub
    const repository = `${this.sourceRepoName}`;

    // Construct the pull request URL
    const prUrl = `https://${this.getHost()}/${this.repoOwner}/${this.sourceRepoName}/pull/${prNumber}`;

    return new PullRequest(prNumber, commitSha, repository, false, undefined, prUrl);
  }

  /**
   * Creates a sample commit in the source repository
   *
   * @returns {Promise<string>} - Returns the commit SHA of the created commit
   */
  public override async createSampleCommitOnSourceRepo(): Promise<string> {
    // Get contentModifications from the template
    if (!this.template) {
      throw new Error('Template not set for this repository');
    }

    const contentModifications = this.template.getContentModifications();
    const commitMessage = 'Test commit from TSSC e2e test';

    // Use the common commit method
    return this.commitChangesToRepo(
      this.repoOwner,
      this.sourceRepoName,
      contentModifications,
      commitMessage,
      'main'
    );
  }

  public override async getFileContentInString(
    owner: string,
    repo: string,
    filePath: string,
    branch: string
  ): Promise<string> {
    try {
      // Get the content of the file
      this.logger.info(`Getting File Contents of ${filePath} in repo ${repo}`);
      const fileContent = await this.githubClient.repository.getContent(owner, repo, filePath, branch);

      if (!fileContent || !('content' in fileContent)) {
        throw new Error(`Could not retrieve content for file: ${filePath}`);
      }

      // Decode the content from base64
      return Buffer.from(fileContent.content, 'base64').toString('utf-8');
    } catch (error: any) {
      this.logger.error(`Error getting file contents of ${filePath} in repo ${repo}: ${error}`);
      throw error;
    }
  }

  /**
   * Creates a promotion pull request in the gitops repository to move changes between environments
   * @param environment The target environment for promotion (e.g., 'development', 'stage', 'prod')
   * @param image The new image to be deployed (full image URL with tag)
   * @returns Promise with the created pull request details
   */
  public override async createPromotionPullRequestOnGitopsRepo(
    environment: Environment,
    image: string
  ): Promise<PullRequest> {
    const newBranchName = `promote-to-${environment}-${Date.now()}`;
    const title = `Promote to ${environment} environment`;
    const description = `This PR promotes the application to the ${environment} environment with image: ${image}`;
    const baseBranch = 'main'; // Default base branch

    // The file path in the gitops repository to be modified
    const filePath = `components/${this.componentName}/overlays/${environment}/deployment-patch.yaml`;

    const contentModifications: ContentModifications = {};

    try {
      // Get the current content of the deployment patch file
      const currentContent = await this.getFileContentInString(
        this.repoOwner,
        this.gitOpsRepoName,
        filePath,
        baseBranch
      );

      // Parse the content to find the current image line
      const lines = currentContent.split('\n');
      let imageLineIndex = -1;
      let oldImageLine = '';

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('- image:')) {
          imageLineIndex = i;
          oldImageLine = lines[i];
          break;
        }
      }

      if (imageLineIndex === -1) {
        throw new Error(`Could not find image line in file: ${filePath}`);
      }

      // Create the new image line with the same indentation
      const indentation = oldImageLine.match(/^\s*/)?.[0] || '';
      const newImageLine = `${indentation}- image: ${image}`;

      // Add the modification
      contentModifications[filePath] = [
        {
          oldContent: oldImageLine,
          newContent: newImageLine,
        },
      ];

      this.logger.info(`Creating a promotion PR for environment: ${environment}`);
      this.logger.info(`Will update image from "${oldImageLine.trim()}" to "${newImageLine.trim()}"`);

      // Create a PR with the changes
      const result = await this.githubClient.pullRequests.createPullRequest(
        this.repoOwner,
        this.gitOpsRepoName,
        this.repoOwner,
        baseBranch,
        newBranchName,
        contentModifications,
        title,
        description
      );

      // Extract the pull number and commit SHA from the result
      const { prNumber, commitSha } = result;

      this.logger.info(`Successfully created promotion PR #${prNumber} for ${environment} environment`);

      // Construct the pull request URL
      const prUrl = `https://${this.getHost()}/${this.repoOwner}/${this.gitOpsRepoName}/pull/${prNumber}`;

      return new PullRequest(prNumber, commitSha, this.gitOpsRepoName, false, undefined, prUrl);
    } catch (error: any) {
      this.logger.error(`Error creating promotion PR for ${environment}: ${error}`);
      throw error;
    }
  }

  /**
   * Merges a pull request in the GitHub repository and returns the updated PR
   * with merge information
   *
   * @param pullRequest The pull request to merge
   * @returns Updated PullRequest object with merge information
   */
  public override async mergePullRequest(pullRequest: PullRequest): Promise<PullRequest> {
    this.logger.info(`Merging pull request #${pullRequest.pullNumber}...`);
    // if pullRequest is already merged, return it
    if (pullRequest.isMerged) {
      this.logger.info(`Pull request #${pullRequest.pullNumber} is already merged.`);
      return pullRequest;
    }

    try {
      // Call the GitHub API to merge the PR
      const mergeResponse = await this.githubClient.pullRequests.mergePullRequest(
        this.repoOwner,
        pullRequest.repository,
        pullRequest.pullNumber
      );

      if (!mergeResponse || !mergeResponse.sha) {
        throw new Error(
          `Merge succeeded but didn't return a commit SHA for PR #${pullRequest.pullNumber}`
        );
      }

      this.logger.info(
        `Pull request #${pullRequest.pullNumber} merged successfully with SHA: ${mergeResponse.sha}`
      );

      // Create a new PR object with the updated merge information
      const mergedPR = new PullRequest(
        pullRequest.pullNumber,
        mergeResponse.sha, // Use the merge commit SHA
        pullRequest.repository,
        true, // Mark as merged
        new Date().toISOString(), // Set merge timestamp
        pullRequest.url // Preserve the original URL
      );

      return mergedPR;
    } catch (error: unknown) {
      this.logger.error(`Failed to merge pull request #${pullRequest.pullNumber}: ${error}`);
      throw error;
    }
  }

  /**
   * Commits changes to files in a specified repository
   * @param owner The repository owner
   * @param repo The repository name
   * @param contentModifications Object containing file modifications
   * @param commitMessage Message for the commit
   * @param branch The branch to commit to (default: 'main')
   * @returns Promise with commit SHA
   */
  public override async commitChangesToRepo(
    owner: string,
    repo: string,
    contentModifications: ContentModifications,
    commitMessage: string,
    branch: string = 'main'
  ): Promise<string> {
    try {
      // Use batch commit method from githubClient to commit all changes at once
      // Now passing the branch parameter to the commit method
      const commitSha = await this.githubClient.repository.commit(
        owner,
        repo,
        contentModifications,
        commitMessage,
        branch
      );

      this.logger.info(
        `Successfully committed all changes in a batch commit to branch '${branch}' with SHA: ${commitSha}`
      );
      return commitSha;
    } catch (error: any) {
      this.logger.error(`Error creating batch commit on branch '${branch}': ${error}`);
      throw error;
    }
  }

  /**
   * Creates a direct commit to the gitops repository to update the image for a specific environment
   * @param environment The target environment for promotion (e.g., 'development', 'stage', 'prod')
   * @param image The new image to be deployed (full image URL with tag)
   * @returns Promise with the commit SHA
   */
  public override async createPromotionCommitOnGitOpsRepo(
    environment: Environment,
    image: string
  ): Promise<string> {
    const branch = 'main'; // Default branch for GitOps repo
    const commitMessage = `Update ${environment} environment to image ${image}`;

    // The file path in the gitops repository to be modified
    const filePath = `components/${this.componentName}/overlays/${environment}/deployment-patch.yaml`;

    const contentModifications: ContentModifications = {};

    try {
      this.logger.info(`Creating a direct promotion commit for environment: ${environment}`);

      // Get the current content of the deployment patch file
      const currentContent = await this.getFileContentInString(
        this.repoOwner,
        this.gitOpsRepoName,
        filePath,
        branch
      );

      // Parse the content to find the current image line
      const lines = currentContent.split('\n');
      let imageLineIndex = -1;
      let oldImageLine = '';

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('- image:')) {
          imageLineIndex = i;
          oldImageLine = lines[i];
          break;
        }
      }

      if (imageLineIndex === -1) {
        throw new Error(`Could not find image line in file: ${filePath}`);
      }

      // Create the new image line with the same indentation
      const indentation = oldImageLine.match(/^\s*/)?.[0] || '';
      const newImageLine = `${indentation}- image: ${image}`;

      // Add the modification
      contentModifications[filePath] = [
        {
          oldContent: oldImageLine,
          newContent: newImageLine,
        },
      ];

      this.logger.info(`Will update image from "${oldImageLine.trim()}" to "${newImageLine.trim()}"`);

      // Create a direct commit with the changes
      const commitSha = await this.commitChangesToRepo(
        this.repoOwner,
        this.gitOpsRepoName,
        contentModifications,
        commitMessage,
        branch
      );

      this.logger.info(
        `Successfully created direct promotion commit (${commitSha.substring(0, 7)}) for ${environment} environment`
      );
      return commitSha;
    } catch (error: any) {
      this.logger.error(`Error creating promotion commit for ${environment}: ${error}`);
      throw error;
    }
  }

  public override async extractApplicationImage(environment: Environment): Promise<string> {
    const filePath = `components/${this.componentName}/overlays/${environment}/deployment-patch.yaml`;
    this.logger.info(`Extracting application image from file: ${filePath}`);
    try {
      // Use a regex pattern that can handle both inline and multi-line image formats
      // Pattern explanation:
      // 1. (?:^|\s+)- image:(?:\s+(.+)$)? - Matches '- image:' with optional value on same line
      // 2. |\s+- image:$\s+(.+)$ - Matches '- image:' with value on next line (indented)
      const imagePattern = /(?:^|\s+)-\s+image:(?:\s+(.+)$)?|(^\s+.+$)/gm;

      const matches = await this.githubClient.repository.extractContentByRegex(
        this.repoOwner,
        this.gitOpsRepoName,
        filePath,
        imagePattern,
        'main'
      );

      if (!matches || matches.length === 0) {
        throw new Error(`No image value found in file: ${filePath}`);
      }

      // Process the matches to extract the actual image URL
      let imageValue = '';

      // Check if we have a direct match with '- image: value'
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        if (match.includes('- image:')) {
          // This is a line with "- image:" that might have the value directly
          const parts = match.split('- image:');
          if (parts.length > 1 && parts[1].trim()) {
            imageValue = parts[1].trim();
            break;
          } else if (i + 1 < matches.length && !matches[i + 1].includes('- image:')) {
            // If this line just has "- image:" and next line doesn't have "- image:",
            // assume next line is the image value
            imageValue = matches[i + 1].trim();
            break;
          }
        }
      }

      if (!imageValue) {
        throw new Error(`Could not parse image value from matches in file: ${filePath}`);
      }

      this.logger.info(`Extracted image from ${filePath}: ${imageValue}`);
      return imageValue;
    } catch (error: any) {
      this.logger.error(`Error extracting application image: ${error}`);
      throw error;
    }
  }

  /**
   * Gets the SHA256 commit hash for the source repository
   *
   * @param branch - The branch name to get the commit hash for (default: 'main')
   * @returns Promise resolving to the SHA256 commit hash of the latest commit in the source repository
   */
  public override async getSourceRepoCommitSha(branch: string = 'main'): Promise<string> {
    try {
      this.logger.info(
        `Getting latest commit SHA for source repo: ${this.sourceRepoName}, branch: ${branch}`
      );

      return await this.githubClient.repository.getBranchCommitSha(
        this.repoOwner,
        this.sourceRepoName,
        branch
      );
    } catch (error: any) {
      this.logger.error(`Failed to get commit SHA for source repo: ${error}`);
      throw error;
    }
  }

  /**
   * Gets the SHA256 commit hash for the GitOps repository
   *
   * @param branch - The branch name to get the commit hash for (default: 'main')
   * @returns Promise resolving to the SHA256 commit hash of the latest commit in the GitOps repository
   */
  public override async getGitOpsRepoCommitSha(branch: string = 'main'): Promise<string> {
    try {
      this.logger.info(
        `Getting latest commit SHA for GitOps repo: ${this.gitOpsRepoName}, branch: ${branch}`
      );

      return await this.githubClient.repository.getBranchCommitSha(
        this.repoOwner,
        this.gitOpsRepoName,
        branch
      );
    } catch (error: any) {
      this.logger.error(`Failed to get commit SHA for GitOps repo: ${error}`);
      throw error;
    }
  }

  /**
   * Configures a webhook for the source repository
   * @param webhookUrl The URL of the webhook to configure
   */
  public override async configWebhookOnSourceRepo(webhookUrl: string): Promise<void> {
    try {
      this.logger.info(`Configuring webhook for source repo at ${webhookUrl}`);
      await this.githubClient.webhooks.configWebhook(this.repoOwner, this.sourceRepoName, {
        url: webhookUrl,
        secret: process.env.WEBHOOK_SECRET || 'default-secret-please-change', // TODO: Make this configurable
        contentType: 'json',
        insecureSSL: false, // Secure by default
        events: ['push', 'pull_request'],
        active: true
      });
    } catch (error: any) {
      this.logger.error(`Failed to configure webhook on source repo: ${error}`);
      throw error;
    }
  }

  /**
   * Configures a webhook for the GitOps repository
   * @param webhookUrl The URL of the webhook to configure
   */
  public override async configWebhookOnGitOpsRepo(webhookUrl: string): Promise<void> {
    try {
      this.logger.info(`Configuring webhook for GitOps repo at ${webhookUrl}`);
      await this.githubClient.webhooks.configWebhook(this.repoOwner, this.gitOpsRepoName, {
        url: webhookUrl,
        secret: process.env.WEBHOOK_SECRET || 'default-secret-please-change', // TODO: Make this configurable
        contentType: 'json',
        insecureSSL: false, // Secure by default
        events: ['push', 'pull_request'],
        active: true
      });
    } catch (error: any) {
      this.logger.error(`Failed to configure webhook on GitOps repo: ${error}`);
      throw error;
    }
  }

  public override getGitOpsRepoUrl(): string {
    return `https://${this.getHost()}/${this.repoOwner}/${this.gitOpsRepoName}`;
  }

  public override getSourceRepoUrl(): string {
    return `https://${this.getHost()}/${this.repoOwner}/${this.sourceRepoName}`;
  }

  public getOrganization(): string {
    return this.repoOwner;
  }

  /**
   * Gets the owner identifier for the repository
   * For GitHub, this is the organization or user name
   * @returns The repository owner (organization)
   */
  public override getRepoOwner(): string {
    return this.repoOwner;
  }

  // TODO: change the name of this method to updateVariableOnSourceRepo
  public async setVariablesOnSourceRepo(variables: Record<string, string>): Promise<void> {
    for (const [name, value] of Object.entries(variables)) {
      await this.githubClient.variables.setRepoVariable(this.repoOwner, this.sourceRepoName, name, value);
    }
  }

  public async setVariablesOnGitOpsRepo(variables: Record<string, string>): Promise<void> {
    for (const [name, value] of Object.entries(variables)) {
      await this.githubClient.variables.setRepoVariable(this.repoOwner, this.gitOpsRepoName, name, value);
    }
  }

  /**
   * Adds or updates secrets in the source GitHub repository for use in GitHub Actions.
   * @param secrets - An object of secretName: secretValue pairs.
   */
  public async setSecretsOnSourceRepo(secrets: Record<string, string>): Promise<void> {
    // Get the public key for the repository (required for encrypting secrets)
    const publicKeyResponse = await this.githubClient.variables.getRepoPublicKey(
      this.repoOwner,
      this.sourceRepoName
    );

    if (!publicKeyResponse || !publicKeyResponse.key || !publicKeyResponse.key_id) {
      throw new Error(`Failed to retrieve public key for repository ${this.sourceRepoName}`);
    }

    for (const [name, value] of Object.entries(secrets)) {
      // Encrypt the secret value using the repo's public key
      const encryptedValue = await this.encryptSecret(publicKeyResponse.key, value);

      // Set or update the secret in the repository
      await this.githubClient.secrets.createOrUpdateRepoSecret(
        this.repoOwner,
        this.sourceRepoName,
        {
          name: name,
          encryptedValue: encryptedValue,
          keyId: publicKeyResponse.key_id,
        }
      );
    }
  }

  public async setSecretsOnGitOpsRepo(secrets: Record<string, string>): Promise<void> {
    const publicKeyResponse = await this.githubClient.variables.getRepoPublicKey(
      this.repoOwner,
      this.gitOpsRepoName
    );

    if (!publicKeyResponse || !publicKeyResponse.key || !publicKeyResponse.key_id) {
      throw new Error(`Failed to retrieve public key for repository ${this.gitOpsRepoName}`);
    }

    for (const [name, value] of Object.entries(secrets)) {
      // Encrypt the secret value using the repo's public key
      const encryptedValue = await this.encryptSecret(publicKeyResponse.key, value);

      // Set or update the secret in the repository
      await this.githubClient.secrets.createOrUpdateRepoSecret(
        this.repoOwner,
        this.gitOpsRepoName,
        {
          name: name,
          encryptedValue: encryptedValue,
          keyId: publicKeyResponse.key_id,
        }
      );
    }
  }

  /**
   * Encrypts a secret value using the repository's public key.
   * @param publicKey - The base64-encoded public key from GitHub.
   * @param secretValue - The secret value to encrypt.
   * @returns The encrypted value, base64-encoded.
   */
  private async encryptSecret(publicKey: string, secretValue: string): Promise<string> {
    const keyBuffer = Buffer.from(publicKey, 'base64');
    const secretBuffer = Buffer.from(secretValue, 'utf8');
    const encryptedBuffer = Buffer.alloc(secretBuffer.length + sodium.crypto_box_SEALBYTES);
    sodium.crypto_box_seal(encryptedBuffer, secretBuffer, keyBuffer);
    return encryptedBuffer.toString('base64');
  }

  /**
   * Checks if a repository exists in GitHub
   * @param owner The repository owner (organization or user)
   * @param repoName The repository name
   * @returns Promise<boolean> True if repository exists, false otherwise
   */
  public override async checkIfRepositoryExists(owner: string, repoName: string): Promise<boolean> {
    try {
      await this.githubClient.repository.getRepository(owner, repoName);
      return true;
    } catch (error: any) {
      // GithubRepositoryService wraps Octokit errors in GithubApiError (status on statusCode, not status)
      const httpStatus = error?.status ?? error?.statusCode;
      if (httpStatus === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Checks if a file exists in a repository
   * @param owner The repository owner (organization or user)
   * @param repoName The repository name
   * @param filePath The path to the file
   * @param branch The branch to check (default: 'main')
   * @returns Promise<boolean> True if file exists, false otherwise
   */
  public override async checkIfFileExistsInRepository(owner: string, repoName: string, filePath: string, branch: string = 'main'): Promise<boolean> {
    try {
      await this.githubClient.repository.getContent(owner, repoName, filePath, branch);
      return true;
    } catch (error: any) {
      const httpStatus = error?.status ?? error?.statusCode;
      if (httpStatus === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Deletes a file from a repository
   * @param owner The repository owner (organization or user)
   * @param repoName The repository name
   * @param filePath The path to the file to delete
   * @param branch The branch to delete from (default: 'main')
   * @param commitMessage The commit message for the deletion
   * @returns Promise<void>
   */
  public override async deleteFileInRepository(owner: string, repoName: string, filePath: string, branch: string = 'main', commitMessage: string = 'Delete file'): Promise<void> {
    try {
      // Ensure the GitHub client is initialized
      if (!this.githubClient) {
        await this.initialize();
      }

      // First, get the current file to get its SHA
      const fileContent = await this.githubClient.repository.getContent(owner, repoName, filePath, branch);
      
      if (!fileContent || !('sha' in fileContent)) {
        throw new Error(`File ${filePath} not found or is not a file`);
      }

      // Delete the file using the GitHub API
      await this.githubClient.repository.deleteFile(owner, repoName, filePath, commitMessage, fileContent.sha, branch);

      this.logger.info(`Successfully deleted file ${filePath} from ${owner}/${repoName}`);
    } catch (error: any) {
      this.logger.error(`Failed to delete file ${filePath} from ${owner}/${repoName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deletes a folder from a repository using a single tree-based commit
   * @param owner The repository owner (organization or user)
   * @param repoName The repository name
   * @param folderPath The path to the folder to delete
   * @param branch The branch to delete from (default: 'main')
   * @param commitMessage The commit message for the deletion
   * @returns Promise<void>
   */
  public override async deleteFolderInRepository(owner: string, repoName: string, folderPath: string, branch: string = 'main', commitMessage: string = 'Delete folder'): Promise<void> {
    try {
      // Ensure the GitHub client is initialized
      if (!this.githubClient) {
        await this.initialize();
      }

      const octokit = (this.githubClient as any).octokit;
      const normalizedFolder = folderPath.replace(/\/+$/, '');

      // Get the current branch ref and base commit SHA
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo: repoName,
        ref: `heads/${branch}`,
      });
      const baseCommitSha = refData.object.sha;

      // Get the base commit to retrieve the tree SHA
      const { data: commitData } = await octokit.rest.git.getCommit({
        owner,
        repo: repoName,
        commit_sha: baseCommitSha,
      });
      const baseTreeSha = commitData.tree.sha;

      // Get the current tree (flat, recursive)
      const { data: treeData } = await octokit.rest.git.getTree({
        owner,
        repo: repoName,
        tree_sha: baseTreeSha,
        recursive: 'true' as any,
      });

      // GitHub createTree + base_tree only applies explicit updates; omitting paths does NOT remove them.
      // Delete each entry under the folder by setting sha to null (deepest paths first).
      const pathsToDelete = (treeData.tree || []).filter((item: { path?: string }) => {
        if (!item.path) {
          return false;
        }
        return item.path === normalizedFolder || item.path.startsWith(`${normalizedFolder}/`);
      });

      if (pathsToDelete.length === 0) {
        this.logger.info(`No tree entries under ${normalizedFolder} in ${owner}/${repoName}; nothing to delete`);
        return;
      }

      pathsToDelete.sort((a: { path: string }, b: { path: string }) => b.path.length - a.path.length);

      const { data: newTreeData } = await octokit.rest.git.createTree({
        owner,
        repo: repoName,
        base_tree: baseTreeSha,
        tree: pathsToDelete.map((item: { path: string; mode: string; type: string }) => ({
          path: item.path,
          mode: item.mode,
          type: item.type,
          sha: null as any,
        })),
      });

      // Create a new commit with the new tree
      const { data: newCommitData } = await octokit.rest.git.createCommit({
        owner,
        repo: repoName,
        message: commitMessage,
        tree: newTreeData.sha,
        parents: [baseCommitSha],
      });

      // Update the branch ref to point to the new commit
      await octokit.rest.git.updateRef({
        owner,
        repo: repoName,
        ref: `heads/${branch}`,
        sha: newCommitData.sha,
      });

      this.logger.info(`Successfully deleted folder ${folderPath} from ${owner}/${repoName} in a single commit`);
    } catch (error: any) {
      this.logger.error(`Failed to delete folder ${folderPath} from ${owner}/${repoName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deletes a repository from GitHub
   * @param owner The repository owner (organization or user)
   * @param repoName The repository name
   * @returns Promise<void>
   */
  public async deleteRepository(owner: string, repoName: string): Promise<void> {
    try {
      await this.githubClient.repository.deleteRepository(owner, repoName);

      this.logger.info(`Successfully deleted repository ${owner}/${repoName}`);
    } catch (error: any) {
      this.logger.error(`Failed to delete repository ${owner}/${repoName}: ${error.message}`);
      throw error;
    }
  }
}
