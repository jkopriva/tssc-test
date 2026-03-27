import { ScaffolderScaffoldOptions, ScaffolderTask } from '@backstage/plugin-scaffolder-react';
import retry from 'async-retry';
import axios, { Axios, AxiosResponse } from 'axios';
import * as https from 'https';
import { LoggerFactory, Logger } from '../../logger/logger';

// Define the expected response type from the Developer Hub API
interface ComponentIdResponse {
  id: string;
}

export class DeveloperHub {
  private readonly url: string;
  private readonly axios: Axios;
  private readonly logger: Logger;

  public constructor(url: string) {
    if (!url) {
      throw new Error('Cannot initialize DeveloperHubClient without a URL');
    }
    this.url = url;
    this.axios = axios.create({
      httpAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      timeout: 30000, // Global timeout for all requests (30 seconds)
    });
    this.logger = LoggerFactory.getLogger('rhdh.developer-hub');
    this.logger.info(`Initialized Developer Hub client`);
  }

  public getUrl(): string {
    return this.url;
  }

  /**
   * Creates a component in Developer Hub
   * @param componentScaffoldOptions Options for scaffolding the component
   * @returns Promise resolving to the task ID and status
   * @throws Error if the component creation fails
   */
  public async createComponent(
    componentScaffoldOptions: ScaffolderScaffoldOptions
  ): Promise<ComponentIdResponse> {
    try {
      this.logger.info(`Creating component with options: ${componentScaffoldOptions}`);
      const response: AxiosResponse<ComponentIdResponse> = await this.axios.post(
        `${this.url}/api/scaffolder/v2/tasks`,
        componentScaffoldOptions
      );

      return response.data;
    } catch (error) {
      throw new Error(`Failed to create Developer Hub component: ${error}`);
    }
  }

  /**
   * Retrieves the status of a task from Developer Hub
   * @param taskId ID of the task to retrieve
   * @returns Promise resolving to the task status
   * @throws Error if the task retrieval fails
   */
  public async getComponent(componentId: string): Promise<ScaffolderTask> {
    try {
      const response: AxiosResponse<ScaffolderTask> = await this.axios.get(
        `${this.url}/api/scaffolder/v2/tasks/${componentId}`
      );

      return response.data;
    } catch (error) {
      throw new Error(`Failed to retrieve Developer Hub task status: ${error}`);
    }
  }

  /**
   * Retrieves the status of a component creation task from Developer Hub
   * @param componentId ID of the component task to retrieve status for
   * @returns Promise resolving to the task status, status: 'failed' | 'completed' | 'processing' | 'open' | 'cancelled'
   * @throws Error if the task status retrieval fails
   */
  public async getComponentStatus(componentId: string): Promise<string> {
    const component = await this.getComponent(componentId);
    return component.status;
  }

  /**
   * Retrieves the logs of a component creation task from Developer Hub
   * @param componentId ID of the component task to retrieve logs for
   * @returns Promise resolving to the task logs
   * @throws Error if the task log retrieval fails
   */
  public async getComponentLogs(componentId: string): Promise<string> {
    try {
      const response: AxiosResponse<string> = await this.axios.get(
        `${this.url}/api/scaffolder/v2/tasks/${componentId}/eventstream`
      );

      return response.data;
    } catch (error) {
      throw new Error(`Failed to retrieve Developer Hub task logs: ${error}`);
    }
  }

  /**
   * Waits until a component creation task is completed, failed, or cancelled
   *
   * This method polls the component status until it reaches a terminal state
   * (completed, failed, or cancelled). It uses exponential backoff for retries
   * and provides detailed logging throughout the process.
   *
   * @param taskId ID of the component task to wait for
   * @returns Promise resolving when the task has reached a terminal state
   * @throws Error if the task fails or is cancelled, or if max retries are exceeded
   */
  public async waitUntilComponentIsCompleted(taskId: string): Promise<void> {
    this.logger.info(`Waiting for component creation task ${taskId} to complete...`);

    // Define the operation that will be retried
    const checkComponentStatus = async (bail: (e: Error) => void): Promise<void> => {
      try {
        // Get the latest task status
        const taskStatus = await this.getComponent(taskId);
        const status = taskStatus.status;

        this.logger.info(`Component creation status: ${status}`);

        // Check if the task has reached a terminal state
        if (status === 'completed') {
          this.logger.info('Component was created successfully!');
          return;
        } else if (status === 'failed' || status === 'cancelled') {
          this.logger.error(`Component creation ${status}.`, { taskId });

          // Get logs to understand what went wrong
          try {
            const logs = await this.getComponentLogs(taskId);
            this.logger.error(`Task logs: ${logs}`);
          } catch (logError) {
            this.logger.error(`Failed to retrieve task logs: ${logError instanceof Error ? logError.message : String(logError)}`);
          }

          // Use bail to immediately exit the retry loop for terminal failure states
          bail(new Error(`Component creation ${status} for task ${taskId}`));
          return; // This line won't be reached after bail, but added for clarity
        }

        // If still processing or open, throw error to trigger retry
        throw new Error(`Component creation still in progress (status: ${status})`);
      } catch (error) {
        // For errors that indicate a problem with the API call itself,
        // we might want to handle them differently (e.g., network errors)
        if (error instanceof Error && error.message.includes('Failed to retrieve')) {
          this.logger.warn(`API error while checking component status: ${error}`);
        }

        // Re-throw the error to trigger retry
        throw error;
      }
    };

    const maxRetries = 24; // Maximum number of retries
    const timeout = 5000;

    try {
      await retry(checkComponentStatus, {
        retries: maxRetries,
        minTimeout: timeout,
        maxTimeout: timeout,
        onRetry: (error: Error, attempt: number) => {
          this.logger.warn(
            `Retry attempt ${attempt}/${maxRetries} for task ${taskId}: ${error}`
          );
        },
      });

      // If we get here, the component was created successfully
      this.logger.info(`Task ${taskId} completed successfully`);
    } catch (error) {
      // Handle terminal errors after max retries
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('failed') || errorMessage.includes('cancelled')) {
        this.logger.error(`Component creation failed or was cancelled: ${errorMessage}`);
        throw new Error(`Component creation failed: ${errorMessage}`);
      } else {
        this.logger.error(
          `Failed to check component status after ${maxRetries} retries: ${errorMessage}`
        );
        throw new Error(`Component creation timed out: ${errorMessage}`);
      }
    }
  }

  /**
   * Gets all entities with retry logic for network resilience
   * @returns Promise<AxiosResponse> - Response containing entities
   * @throws Error if all retry attempts fail
   */
  private async getEntitiesWithRetry(): Promise<AxiosResponse> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second base delay
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.info(`Fetching entities (attempt ${attempt}/${maxRetries})`);
        const response = await this.axios.get(`${this.url}/api/catalog/entities`, {
          timeout: 10000, // 10 second per-request timeout
        });
        return response;
      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries;
        
        if (isLastAttempt) {
          this.logger.error(`Failed to fetch entities after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
          throw error;
        }
        
        // Calculate exponential backoff delay
        const delay = baseDelay * Math.pow(2, attempt - 1);
        this.logger.info(`Request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // This should never be reached, but TypeScript requires it
    throw new Error('Unexpected error in getEntitiesWithRetry');
  }

  /**
   * Deletes entities from Developer Hub by selector
   * @param selector The selector to match entities (e.g., component name)
   * @returns Promise<boolean> - true if deletion was successful, false otherwise
   */
  public async deleteEntitiesBySelector(selector: string): Promise<boolean> {
    try {
      this.logger.info(`Deleting entities with selector: ${selector}`);

      // Get all entities with retry logic for network resilience
      const response = await this.getEntitiesWithRetry();
      
      // Parse selector format (e.g., "kind=Component,name=my-component"); split only on first '=' so values may contain '='
      const selectorParts = selector.split(',');
      const selectorCriteria: { [key: string]: string } = {};
      
      selectorParts.forEach(part => {
        const idx = part.indexOf('=');
        if (idx === -1) return;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (key && value) {
          selectorCriteria[key] = value;
        }
      });
      
      const filteredEntities = response.data.filter((entity: any) => {
        // Skip entities without metadata.uid to avoid unregistering unidentified entries
        if (!entity.metadata?.uid) {
          return false;
        }
        
        // Check if entity matches all selector criteria using strict equality
        return Object.entries(selectorCriteria).every(([key, value]) => {
          switch (key) {
            case 'kind':
              return entity.kind === value;
            case 'name':
              // Use strict equality for Component and Resource names
              if (entity.kind === 'Component' || entity.kind === 'Resource') {
                return entity.metadata?.name === value;
              }
              // For Location entities, check spec.target
              if (entity.kind === 'Location') {
                return entity.spec?.target === value;
              }
              return false;
            case 'namespace':
              return entity.metadata?.namespace === value;
            default:
              return false;
          }
        });
      });

      if (filteredEntities.length === 0) {
        this.logger.info(`No entities found in catalog matching selector "${selector}".`);
        return false;
      }

      // Delete all filtered entities with retry logic for Backstage eventual consistency
      const results = await Promise.all(
        filteredEntities.map((entity: any) => 
          retry(
            async () => {
              const success = await this.unregisterEntityByUid(entity.metadata.uid);
              if (!success) {
                throw new Error(`Failed to delete entity UID ${entity.metadata.uid}: deletion returned false`);
              }
              return success;
            },
            {
              retries: 3,
              minTimeout: 1000,
              maxTimeout: 3000,
              factor: 2,
              onRetry: (error: Error, attempt: number) => {
                this.logger.warn(
                  `[RETRY ${attempt}/3] Entity UID: ${entity.metadata.uid} | Reason: ${error.message}`
                );
              }
            }
          )
        )
      );

      if (results.every(r => r === true)) {
        this.logger.info(`Successfully deleted all entities with selector: ${selector}`);
        return true;
      } else {
        this.logger.warn(`Some entities with selector ${selector} failed to delete`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Error deleting entities with selector ${selector}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }


  /**
   * Unregisters an entity by its UID
   * @param id The entity UID to delete
   * @returns Promise<boolean> - true if deletion was successful, false otherwise
   */
  private async unregisterEntityByUid(id: string): Promise<boolean> {
    try {
      const response = await this.axios.delete(`${this.url}/api/catalog/entities/by-uid/${id}`);
      if (response.status >= 200 && response.status < 300) {
        this.logger.info(`Entity UID: ${id} deleted successfully (status ${response.status})`);
        return true;
      } else {
        this.logger.warn(`Failed to delete entity UID ${id}: ${response.status} ${response.statusText}`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Error deleting entity with UID ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }
}
