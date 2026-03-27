import { PipelineStatus } from '../../../rhtap/core/integration/ci/pipeline';

// Project related types
export interface GitLabProject {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly web_url: string;
  readonly default_branch: string;
  readonly visibility: string;
  readonly namespace: {
    readonly id: number;
    readonly name: string;
    readonly path: string;
  };
}

export interface GitLabProjectSearchParams {
  readonly owned?: boolean;
  readonly membership?: boolean;
  readonly search?: string;
}

// Branch related types
export interface GitLabBranch {
  readonly name: string;
  readonly merged: boolean;
  readonly protected: boolean;
  readonly default: boolean;
  readonly web_url: string;
}

// Commit related types
export interface GitLabCommit {
  readonly id: string;
  readonly short_id: string;
  readonly title: string;
  readonly message: string;
  readonly author_name: string;
  readonly author_email: string;
  readonly created_at: string;
}

// Repository tree related types
export interface RepositoryTreeNode {
  readonly id: string;
  readonly name: string;
  readonly type: 'blob' | 'tree';
  readonly path: string;
  readonly mode: string;
}

export interface GitLabCommitSearchParams {
  readonly ref_name?: string;
  readonly path?: string;
  readonly since?: string;
  readonly until?: string;
}

// Merge Request related types
export interface GitLabMergeRequest {
  readonly id: number;
  readonly iid: number;
  readonly project_id: number;
  readonly title: string;
  readonly description: string;
  readonly state: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly source_branch: string;
  readonly target_branch: string;
  readonly web_url: string;
  readonly author: {
    readonly id: number;
    readonly name: string;
    readonly username: string;
  };
  readonly merge_commit_sha?: string;
  readonly sha?: string;
}

export interface CreateMergeRequestOptions {
  readonly description?: string;
  readonly removeSourceBranch?: boolean;
  readonly squash?: boolean;
}

export interface MergeMergeRequestOptions {
  readonly mergeCommitMessage?: string;
  readonly squash?: boolean;
  readonly squashCommitMessage?: string;
  readonly shouldRemoveSourceBranch?: boolean;
}

export interface MergeRequestResult {
  readonly prNumber: number;
  readonly commitSha: string;
}

export interface MergeResult {
  readonly id: string;
  readonly sha: string;
  readonly mergeCommitSha: string;
}

// Pipeline related types
export interface GitLabPipeline {
  readonly id: number;
  readonly sha: string;
  readonly source: string;
  readonly ref: string;
  readonly status: string;
  readonly web_url: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly project_id: number;
}

// Job related type
export interface GitLabJob {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly stage: string;
  readonly ref: string;
  readonly web_url: string;
  readonly created_at: string;
  readonly started_at: string;
  readonly finished_at: string;
  readonly allow_failure: boolean;
}

export interface GitLabPipelineSearchParams {
  readonly sha?: string;
  readonly status?: string;
  readonly ref?: string;
  readonly [key: string]: any; // Allow additional GitLab API parameters
}

// Webhook related types
export interface GitLabWebhook {
  readonly id: number;
  readonly url: string;
  readonly created_at: string;
  readonly push_events: boolean;
  readonly merge_requests_events: boolean;
  readonly tag_push_events: boolean;
  readonly enable_ssl_verification: boolean;
}

export interface CreateWebhookOptions {
  readonly token?: string;
  readonly pushEvents?: boolean;
  readonly mergeRequestsEvents?: boolean;
  readonly tagPushEvents?: boolean;
  readonly enableSslVerification?: boolean;
}

// File related types
export interface GitLabFile {
  readonly content: string;
  readonly encoding: string;
  readonly file_name?: string;
  readonly file_path?: string;
  readonly size?: number;
  readonly last_commit_id?: string;
}

export interface GitLabFileOperationResult {
  readonly file_path: string;
  readonly branch: string;
}

export interface FileAction {
  readonly action: 'create' | 'update' | 'delete';
  readonly filePath: string;
  readonly content?: string;
}

export interface CommitResult {
  readonly id: string;
}

// Variable related types
export interface GitLabVariable {
  readonly key: string;
  readonly value: string;
  readonly protected: boolean;
  readonly masked: boolean;
}

export interface CreateVariableOptions {
  readonly protected?: boolean;
  readonly masked?: boolean;
}

// Utility types
export type ProjectIdentifier = number | string;
export type ContentExtractionResult = string[];

// Status mapping for GitLab pipelines
export const GITLAB_PIPELINE_STATUS_MAPPING: Record<string, PipelineStatus> = {
  success: PipelineStatus.SUCCESS,
  failed: PipelineStatus.FAILURE,
  running: PipelineStatus.RUNNING,
  pending: PipelineStatus.PENDING,
  created: PipelineStatus.PENDING,
  canceled: PipelineStatus.FAILURE,
  skipped: PipelineStatus.FAILURE,
  manual: PipelineStatus.PENDING,
  scheduled: PipelineStatus.PENDING,
  waiting_for_resource: PipelineStatus.PENDING,
  preparing: PipelineStatus.PENDING,
} as const; 