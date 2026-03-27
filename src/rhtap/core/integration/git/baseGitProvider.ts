import { KubeClient } from '../../../../../src/api/ocp/kubeClient';
import { Environment } from '../cd/argocd';
import { Git, GitType } from './gitInterface';
import { PullRequest } from './models';
import { ContentModifications } from '../../../modification/contentModification';

/**
 * Abstract base class for Git providers with common functionality
 */
export abstract class BaseGitProvider implements Git {
  private gitType: GitType;
  protected sourceRepoName: string;
  protected gitOpsRepoName: string;
  protected componentName: string;
  protected secret?: Record<string, string>;
  protected kubeClient: KubeClient;

  constructor(componentName: string, type: GitType, kubeClient: KubeClient) {
    this.gitType = type;
    this.componentName = componentName;
    // Default initialization for source and gitops repo names
    this.sourceRepoName = componentName;
    this.gitOpsRepoName = `${componentName}-gitops`;
    this.kubeClient = kubeClient;
  }

  /**
   * Get the latest commit SHA from the source repository
   * @param branch The branch name to get the commit SHA from (default: 'main')
   * @returns Promise with the commit SHA
   */
  public abstract getSourceRepoCommitSha(branch?: string): Promise<string>;

  /**
   * Get the latest commit SHA from the GitOps repository
   * @param branch The branch name to get the commit SHA from (default: 'main')
   * @returns Promise with the commit SHA
   */
  public abstract getGitOpsRepoCommitSha(branch?: string): Promise<string>;

  public abstract createPromotionCommitOnGitOpsRepo(
    environment: Environment,
    image: string
  ): Promise<string>;

  public getGitType(): GitType {
    return this.gitType;
  }

  public getSourceRepoName(): string {
    return this.sourceRepoName;
  }

  public getGitOpsRepoName(): string {
    return this.gitOpsRepoName;
  }

  public abstract mergePullRequest(pullRequest: PullRequest): Promise<PullRequest>;
  /**
   * Creates a sample pull request with modifications to specified files in the source repository
   */
  public abstract createSamplePullRequestOnSourceRepo(): Promise<PullRequest>;

  /**
   * Creates a sample commit with modifications directly to the main branch of the source repository
   */
  public abstract createSampleCommitOnSourceRepo(): Promise<string>;

  /**
   * Creates a promotion pull request in the gitops repository
   * This is used for promoting changes between environments (dev → stage → prod)
   *
   * @param environment The target environment for promotion
   * @param image The image to promote
   */
  public abstract createPromotionPullRequestOnGitopsRepo(
    environment: string,
    image: string
  ): Promise<PullRequest>;

  /**
   * Commits changes to files in a specified repository
   * @param owner The repository owner
   * @param repo The repository name
   * @param contentModifications Object containing file modifications
   * @param commitMessage Message for the commit
   * @param branch The branch to commit to (default: 'main')
   * @returns Promise with commit SHA
   */
  public abstract commitChangesToRepo(
    owner: string,
    repo: string,
    contentModifications: ContentModifications,
    commitMessage: string,
    branch?: string
  ): Promise<string>;

  public abstract extractApplicationImage(environment: Environment): Promise<string>;

  /**
   * Gets the integration secret, using the cached version if available
   * @returns Promise resolving to the secret data
   */
  public async getIntegrationSecret(): Promise<Record<string, string>> {
    // Return cached secret if available
    if (this.secret) {
      return this.secret;
    }

    // Load the secret from the provider-specific implementation
    this.secret = await this.loadSecret();
    return this.secret;
  }

  /**
   * Provider-specific method to load the integration secret from Kubernetes
   * @returns Promise resolving to the secret data
   */
  protected abstract loadSecret(): Promise<Record<string, string>>;

  /**
   * Configures a webhook on the source repository
   * @param webhookUrl The URL of the webhook to configure
   */
  public abstract configWebhookOnSourceRepo(webhookUrl: string): Promise<void>;

  /**
   * Configures a webhook on the GitOps repository
   * @param webhookUrl The URL of the webhook to configure
   */
  public abstract configWebhookOnGitOpsRepo(webhookUrl: string): Promise<void>;

  public abstract getGitOpsRepoUrl(): string;

  public abstract getSourceRepoUrl(): string;

  public getHost(): string {
    if (!this.secret?.host) {
      throw new Error(`Host not found in the secret. Please ensure the host is provided.`);
    }
    return this.secret.host;
  }

  /**
   * Gets the owner identifier for the repository
   * This could be an organization name (GitHub), group name (GitLab), workspace name (Bitbucket), etc.
   * Every provider must implement this method to return the appropriate owner concept
   * @returns The repository owner identifier appropriate for the Git provider
   */
  public abstract getRepoOwner(): string;

  /**
   * Get content of specified file in the repo
   * @param owner The repository owner
   * @param repo The repository name
   * @param filePath The file path
   * @param branch The branch to commit to (default: 'main')
   * @returns file content in string type
   */
  public abstract getFileContentInString(
    owner: string,
    repo: string,
    filePath: string,
    branch: string
  ): Promise<string>;

  public abstract getToken(): string;

  public getUsername(): string {
    if (!this.secret?.username) {
      throw new Error(`Username not found in ${this.getGitType()} secret. Please ensure the username is provided.`);
    }
    return this.secret.username;
  }

  public abstract checkIfRepositoryExists(owner: string, repoName: string): Promise<boolean>;

  public abstract checkIfFileExistsInRepository(
    owner: string,
    repoName: string,
    filePath: string,
    branch?: string
  ): Promise<boolean>;

  public abstract deleteFileInRepository(
    owner: string,
    repoName: string,
    filePath: string,
    branch?: string,
    commitMessage?: string
  ): Promise<void>;

  public abstract deleteFolderInRepository(
    owner: string,
    repoName: string,
    folderPath: string,
    branch?: string,
    commitMessage?: string
  ): Promise<void>;
}
