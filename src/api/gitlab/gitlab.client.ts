import { Gitlab } from '@gitbeaker/rest';
import retry from 'async-retry';
import { defaultLogger } from '../../logger/logger';
import { GitLabConfig } from './config/gitlab.config';
import { GitLabProjectService } from './services/gitlab-project.service';
import { GitLabRepositoryService } from './services/gitlab-repository.service';
import { GitLabMergeRequestService } from './services/gitlab-merge-request.service';
import { GitLabWebhookService } from './services/gitlab-webhook.service';
import { GitLabPipelineService } from './services/gitlab-pipeline.service';
import { BaseApiClient } from '../common/base-api.client';
import { CreateWebhookOptions, GitLabPipeline, GitLabPipelineSearchParams, GitLabWebhook, MergeMergeRequestOptions, MergeResult, ProjectIdentifier, RepositoryTreeNode } from './types/gitlab.types';

/**
 * GitLab API Client
 * 
 * A comprehensive client for interacting with GitLab's REST API. This client provides
 * a service-oriented architecture with dedicated services for different GitLab operations.
 * It uses the Gitbeaker library under the hood for GitLab API interactions.
 * 
 * @example Basic Usage
 * ```typescript
 * import { GitLabClient } from './api/gitlab';
 * 
 * const client = new GitLabClient({
 *   token: 'glpat_your_token_here',
 *   baseUrl: 'https://gitlab.example.com', // Your GitLab instance URL
 *   timeout: 60000 // Optional, defaults to 60 seconds
 * });
 * 
 * // Check connectivity
 * const isConnected = await client.ping();
 * const version = await client.getVersion();
 * 
 * // Access different services
 * const projects = await client.projects.getProjects();
 * const mergeRequests = await client.mergeRequests.listMergeRequests('group/project');
 * ```
 * 
 * @example Service-Oriented Usage
 * ```typescript
 * // Project operations
 * const project = await client.projects.getProject('group/project');
 * await client.projects.setEnvironmentVariable(project.id, 'API_KEY', 'secret-value');
 * 
 * // Repository operations
 * const branches = await client.repositories.getBranches('group/project');
 * const commits = await client.repositories.getCommits('group/project', { ref_name: 'main' });
 * const fileContent = await client.repositories.getFileContent('group/project', 'README.md');
 * 
 * // Merge Request operations
 * const mr = await client.mergeRequests.createMergeRequest(
 *   'group/project', 'feature-branch', 'main', 
 *   'MR Title', { description: 'MR Description' }
 * );
 * await client.mergeRequests.mergeMergeRequest('group/project', mr.iid);
 * 
 * // Pipeline operations
 * const pipelines = await client.pipelines.getPipelines('group/project');
 * const logs = await client.pipelines.getPipelineLogs('group/project', 12345);
 * 
 * // Webhook operations
 * const webhook = await client.webhooks.configWebhook('group', 'project', 
 *   'https://your-app.com/webhook');
 * ```
 * 
 * @example Error Handling
 * ```typescript
 * try {
 *   const project = await client.projects.getProject('group/project');
 * } catch (error) {
 *   if (error instanceof GitLabNotFoundError) {
 *     console.log('Project not found');
 *   } else if (error instanceof GitLabApiError) {
 *     console.log(`GitLab API error: ${error.message}`);
 *   }
 * }
 * ```
 */
export class GitLabClient extends BaseApiClient {
  /** Service for GitLab project operations (get, list, variables) */
  public readonly projects: GitLabProjectService;
  
  /** Service for GitLab repository operations (branches, commits, files) */
  public readonly repositories: GitLabRepositoryService;
  
  /** Service for GitLab merge request operations (create, merge, list) */
  public readonly mergeRequests: GitLabMergeRequestService;
  
  /** Service for GitLab webhook operations (create, configure) */
  public readonly webhooks: GitLabWebhookService;
  
  /** Service for GitLab pipeline operations (get, logs, cancel) */
  public readonly pipelines: GitLabPipelineService;
  
  /** The underlying Gitbeaker client instance (private) */
  private readonly client: InstanceType<typeof Gitlab>;

  /**
   * Creates a new GitLab client instance
   * 
   * @param config Configuration options for the GitLab client
   * @param config.token GitLab personal access token (required)
   * @param config.baseUrl GitLab instance base URL (required)
   * @param config.timeout Request timeout in milliseconds (optional, defaults to 60000)
   * 
   * @example
   * ```typescript
   * const client = new GitLabClient({
   *   token: process.env.GITLAB_TOKEN,
   *   baseUrl: 'https://gitlab.example.com',
   *   timeout: 30000
   * });
   * ```
   */
  constructor(config: GitLabConfig) {
    super(config.baseUrl || 'https://gitlab.com', config.timeout || 60000);
    this.client = new Gitlab({
      host: this.baseUrl,
      token: config.token,
      queryTimeout: this.timeout,
      rejectUnauthorized: config.sslVerify,
    });

    this.projects = new GitLabProjectService(this.client);
    this.repositories = new GitLabRepositoryService(this.client);
    this.mergeRequests = new GitLabMergeRequestService(
      this.client,
      this.repositories
    );
    this.webhooks = new GitLabWebhookService(this.client, this.projects);
    this.pipelines = new GitLabPipelineService(this.client);

    this.logger.info('Initialized GitLab client', { baseUrl: this.baseUrl, timeout: this.timeout, sslVerify: config.sslVerify });
  }

  /**
   * Gets the underlying Gitbeaker client instance
   * 
   * This method provides access to the raw Gitbeaker client for advanced operations
   * that aren't covered by the service-oriented interface. Use with caution as it
   * bypasses the error handling and abstraction provided by the services.
   * 
   * @returns The Gitbeaker client instance
   * 
   * @example
   * ```typescript
   * const client = new GitLabClient(config);
   * const gitbeakerClient = client.getClient();
   * 
   * // Direct Gitbeaker API usage
   * const users = await gitbeakerClient.Users.all();
   * ```
   */
  public getClient(): InstanceType<typeof Gitlab> {
    return this.client;
  }

  /**
   * Checks if the GitLab API is reachable and the client is properly authenticated
   *
   * This method performs a lightweight API call to verify connectivity and authentication.
   * It's useful for health checks and connection validation.
   *
   * @returns Promise<boolean> True if the API is reachable and authenticated, false otherwise
   *
   * @example
   * ```typescript
   * const client = new GitLabClient(config);
   *
   * if (await client.ping()) {
   *   console.log('GitLab API is accessible');
   * } else {
   *   console.log('GitLab API is not accessible or token is invalid');
   * }
   * ```
   */
  async ping(): Promise<boolean> {
    try {
      await this.client.Projects.all({ perPage: 1 });
      return true;
    } catch {
      return false;
    }
  }

  public async mergeMergeRequest(
    projectId: ProjectIdentifier,
    mergeRequestId: number,
    options?: MergeMergeRequestOptions
  ): Promise<MergeResult> {
    return this.mergeRequests.mergeMergeRequest(projectId, mergeRequestId, options);
  }

  // Webhook operations
  public async configWebhook(
    owner: string,
    repo: string,
    webhookUrl: string,
    options?: CreateWebhookOptions
  ): Promise<GitLabWebhook> {
    return this.webhooks.configWebhook(owner, repo, webhookUrl, options);
  }

  // Pipeline operations
  /**
   * Gets pipelines for a specific repository and commit SHA with retry functionality
   * @param projectPath The project path in GitLab (e.g., 'group/project')
   * @param sha Optional commit SHA for which to get pipelines
   * @param status Optional status filter for pipelines
   * @returns A promise that resolves to an array of GitLab pipelines
   */
  public async getPipelines(
    projectPath: string,
    sha?: string,
    status?: string
  ): Promise<GitLabPipeline[]> {
    const params: GitLabPipelineSearchParams = {
      ...(sha && { sha }),
      ...(status && { status }),
    };

    return this.pipelines.getPipelines(projectPath, params);
  }

  /**
   * Gets all pipelines for a project
   * @param projectPath The project path in GitLab (e.g., 'group/project')
   * @returns A promise that resolves to an array of GitLab pipelines
   */
  public async getAllPipelines(projectPath: string): Promise<GitLabPipeline[]> {
    return this.pipelines.getAllPipelines(projectPath);
  }

  /**
   * Gets a specific pipeline by ID
   * @param projectPath The project path in GitLab (e.g., 'group/project')
   * @param pipelineId The ID of the pipeline to retrieve
   * @returns A promise that resolves to a GitLab pipeline
   */
  public async getPipelineById(projectPath: string, pipelineId: number): Promise<GitLabPipeline> {
    return this.pipelines.getPipelineById(projectPath, pipelineId);
  }

  /**
   * Gets the logs for a specific pipeline job
   * @param projectPath The project path in GitLab
   * @param jobId The job ID for which to retrieve logs
   * @returns A promise that resolves to the job logs as a string
   */
  public async getPipelineLogs(projectPath: string, pipelineId: number): Promise<string> {
    return this.pipelines.getPipelineLogs(projectPath, pipelineId);
  }

  public async cancelPipeline(projectPath: string, pipelineId: number): Promise<GitLabPipeline> {
    return this.pipelines.cancelPipeline(projectPath, pipelineId);
  }

  /**
   * Gets the repository tree (directory contents) for a project
   * @param projectId The project ID or path
   * @param path The path to get tree for (default: root)
   * @param branch The branch to get tree for (default: 'main')
   * @param recursive When true, list all blobs under `path` (needed to delete nested folders like `.tekton`)
   * @returns Promise with the repository tree contents
   */
  public async getRepositoryTree(
    projectId: ProjectIdentifier,
    path: string = '',
    branch: string = 'main',
    recursive: boolean = false
  ): Promise<RepositoryTreeNode[]> {
    // Input validation
    if (!projectId) {
      throw new Error('Project ID is required for repository tree retrieval');
    }
    if (!branch || branch.trim() === '') {
      throw new Error('Branch is required and cannot be empty');
    }

    const trimmedPath = path.trim();
    const trimmedBranch = branch.trim();

    try {
      const tree = await retry(
        async () => {
          try {
            return await this.client.Repositories.allRepositoryTrees(projectId, {
              path: trimmedPath,
              ref: trimmedBranch,
              ...(recursive ? { recursive: true } : {}),
            });
          } catch (error: any) {
            // Check if error is 404 - don't retry on 404 errors
            if (error.response?.status === 404 || error.status === 404 || error.message?.includes('404')) {
              // Rethrow 404 errors immediately to prevent retries
              throw error;
            }
            // For all other errors, rethrow to let retry mechanism handle them
            throw error;
          }
        },
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
          factor: 2,
          onRetry: (error: Error, attempt: number) => {
            defaultLogger.warn({
              operation: 'getRepositoryTree',
              projectId,
              path: trimmedPath,
              branch: trimmedBranch,
              attempt,
              error: error.message
            }, `Retrying repository tree retrieval (attempt ${attempt}/3)`);
          }
        }
      );

      defaultLogger.info({
        operation: 'getRepositoryTree',
        projectId,
        path: trimmedPath,
        branch: trimmedBranch,
        itemCount: tree.length
      }, `Successfully retrieved repository tree for ${projectId}`);

      return tree as RepositoryTreeNode[];
    } catch (error: any) {
      // Handle 404 errors gracefully for idempotent operations
      if (error.response?.status === 404 || error.status === 404 || error.message?.includes('404')) {
        defaultLogger.info({
          operation: 'getRepositoryTree',
          projectId,
          path: trimmedPath,
          branch: trimmedBranch,
          status: 'not_found'
        }, `Repository tree not found for ${projectId} (404 Not Found)`);
        return [];
      }

      defaultLogger.error({
        operation: 'getRepositoryTree',
        projectId,
        path: trimmedPath,
        branch: trimmedBranch,
        error: error.message,
        status: error.response?.status || error.status
      }, `Failed to get repository tree for ${projectId}`);
      throw error;
    }
  }

  /**
   * Deletes a file from a repository
   * @param projectId The project ID or path
   * @param filePath The path to the file to delete
   * @param branch The branch to delete from (default: 'main')
   * @param commitMessage The commit message for the deletion
   * @returns Promise<void>
   */
  public async deleteFile(
    projectId: ProjectIdentifier,
    filePath: string,
    branch: string = 'main',
    commitMessage: string = 'Delete file'
  ): Promise<void> {
    // Input validation
    if (!projectId) {
      throw new Error('Project ID is required for file deletion');
    }
    if (!filePath || filePath.trim() === '') {
      throw new Error('File path is required and cannot be empty');
    }
    if (!branch || branch.trim() === '') {
      throw new Error('Branch is required and cannot be empty');
    }

    const trimmedFilePath = filePath.trim();
    const trimmedBranch = branch.trim();
    const trimmedCommitMessage = commitMessage.trim() || 'Delete file';

    try {
      await retry(
        async () => {
          try {
            await this.client.RepositoryFiles.remove(projectId, trimmedFilePath, trimmedBranch, trimmedCommitMessage);
          } catch (error: any) {
            // Check if error is 404 - don't retry on 404 errors
            if (error.response?.status === 404 || error.status === 404 || error.message?.includes('404')) {
              // Rethrow 404 errors immediately to prevent retries
              throw error;
            }
            // For all other errors, rethrow to let retry mechanism handle them
            throw error;
          }
        },
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
          factor: 2,
          onRetry: (error: Error, attempt: number) => {
            defaultLogger.warn({
              operation: 'deleteFile',
              projectId,
              filePath: trimmedFilePath,
              attempt,
              error: error.message
            }, `Retrying file deletion (attempt ${attempt}/3)`);
          }
        }
      );

      defaultLogger.info({
        operation: 'deleteFile',
        projectId,
        filePath: trimmedFilePath,
        branch: trimmedBranch
      }, `Successfully deleted file ${trimmedFilePath} from ${projectId}`);
    } catch (error: any) {
      // Handle 404 errors gracefully for idempotent cleanup
      if (error.response?.status === 404 || error.status === 404 || error.message?.includes('404')) {
        defaultLogger.info({
          operation: 'deleteFile',
          projectId,
          filePath: trimmedFilePath,
          status: 'already_absent'
        }, `File ${trimmedFilePath} was already absent from ${projectId} (404 Not Found)`);
        return;
      }

      defaultLogger.error({
        operation: 'deleteFile',
        projectId,
        filePath: trimmedFilePath,
        error: error.message,
        status: error.response?.status || error.status
      }, `Failed to delete file ${trimmedFilePath} from ${projectId}`);
      throw error;
    }
  }
} 
