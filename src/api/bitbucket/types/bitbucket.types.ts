export interface BitbucketClientOptions {
  username?: string;
  appPassword?: string;
  accessToken?: string;
  baseUrl?: string;
  timeout?: number;
}

export interface BitbucketErrorData {
  type: string;
  error: {
    message: string;
    detail?: string;
  };
}

export interface BitbucketPullRequest {
  id: number;
  title: string;
  state: 'OPEN' | 'MERGED' | 'DECLINED';
  links: {
    html: {
      href: string;
    };
  };
  source: {
    branch: {
      name: string;
    };
    repository: {
      full_name: string;
    };
  };
  destination: {
    branch: {
      name: string;
    };
    commit: {
      hash: string;
    };
  };
  merge_commit?: {
    hash: string;
  };
}

export interface BitbucketRepository {
  slug: string;
  full_name: string;
  links: {
    html: {
      href: string;
    };
  };
}

export interface BitbucketUser {
  uuid: string;
  display_name: string;
  nickname: string;
}

export interface BitbucketBranch {
  name: string;
  target: {
    hash: string;
  };
}

export interface BitbucketCommit {
  hash: string;
  message: string;
  author: {
    raw: string;
    user?: BitbucketUser;
  };
  date: string;
}

export interface BitbucketWebhook {
  uuid: string;
  description: string;
  url: string;
  active: boolean;
  events: string[];
}

export interface BitbucketDirectoryEntry {
  path: string;
  type: 'commit_file' | 'commit_directory';
  size?: number;
  commit?: {
    hash: string;
  };
}

export interface BitbucketPaginatedResponse<T> {
  values: T[];
  page?: number;
  pagelen?: number;
  size?: number;
  next?: string;
  previous?: string;
}
