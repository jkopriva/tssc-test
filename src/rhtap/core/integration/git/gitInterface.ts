import { IntegrationSecret } from '../../integrationSecret';
import { Environment } from '../cd/argocd';
import { PullRequest } from './models';
import { ContentModifications } from '../../../modification/contentModification';

export enum GitType {
  GITHUB = 'github',
  GITLAB = 'gitlab',
  BITBUCKET = 'bitbucket',
}

export interface Git extends IntegrationSecret {
  // The organization, user or project that this repo will belong to
  // repoOwner: string;

  getGitType(): GitType;

  /**
   * Get the source repository name (same as component name)
   * @returns The source repository name
   */
  getSourceRepoName(): string;

  /**
   * Get the GitOps repository name (typically component name + '-gitops')
   * @returns The GitOps repository name
   */
  getGitOpsRepoName(): string;

  /**
   * Get the latest commit SHA from the source repository
   * @param branch The branch name to get the commit SHA from (default: 'main')
   * @returns Promise with the commit SHA
   */
  getSourceRepoCommitSha(branch?: string): Promise<string>;

  /**
   * Get the latest commit SHA from the GitOps repository
   * @param branch The branch name to get the commit SHA from (default: 'main')
   * @returns Promise with the commit SHA
   */
  getGitOpsRepoCommitSha(branch?: string): Promise<string>;

  /**
   * Merges a pull request in the repository
   * @param pullRequest The pull request to merge
   * @returns Updated PullRequest object with merge information
   */
  mergePullRequest(pullRequest: PullRequest): Promise<PullRequest>;

  /**
   * Creates a sample pull request in the source repository
   * @returns Promise with the created pull request details
   */
  createSamplePullRequestOnSourceRepo(): Promise<PullRequest>;

  /**
   * Creates a sample commit in the source repository
   * @returns Promise with the commit SHA
   */
  createSampleCommitOnSourceRepo(): Promise<string>;

  /**
   * Creates a promotion pull request in the gitops repository
   * @param environment The target environment for promotion (e.g., 'dev', 'stage', 'prod')
   * @param image The image to be used for the promotion
   * @returns Promise with the created pull request details
   */
  createPromotionPullRequestOnGitopsRepo(environment: string, image: string): Promise<PullRequest>;

  /**
   * Creates a commit in the gitops repository
   * @param environment The target environment for promotion (e.g., 'development', 'stage', 'prod')
   * @param image The image to be used for the promotion
   * @returns Promise with the created commit SHA
   */
  createPromotionCommitOnGitOpsRepo(environment: Environment, image: string): Promise<string>;

  /**
   * Commits changes to files in a specified repository
   * @param owner The repository owner
   * @param repo The repository name
   * @param contentModifications Object containing file modifications
   * @param commitMessage Message for the commit
   * @param branch The branch to commit to (default: 'main')
   * @returns Promise with commit SHA
   */
  commitChangesToRepo(
    owner: string,
    repo: string,
    contentModifications: ContentModifications,
    commitMessage: string,
    branch?: string
  ): Promise<string>;

  extractApplicationImage(environment: Environment): Promise<string>;

  configWebhookOnSourceRepo(webhookUrl: string): Promise<void>;

  configWebhookOnGitOpsRepo(webhookUrl: string): Promise<void>;

  getSourceRepoUrl(): string;

  getGitOpsRepoUrl(): string;

  getHost(): string;

  getRepoOwner(): string;

  getFileContentInString(
    owner: string,
    repo: string,
    filePath: string,
    branch: string
  ): Promise<string>;

  getToken(): string;

  getUsername(): string;

  checkIfRepositoryExists(owner: string, repoName: string): Promise<boolean>;

  checkIfFileExistsInRepository(
    owner: string,
    repoName: string,
    filePath: string,
    branch?: string
  ): Promise<boolean>;

  deleteFileInRepository(
    owner: string,
    repoName: string,
    filePath: string,
    branch?: string,
    commitMessage?: string
  ): Promise<void>;

  deleteFolderInRepository(
    owner: string,
    repoName: string,
    folderPath: string,
    branch?: string,
    commitMessage?: string
  ): Promise<void>;
}
