import { ScaffolderScaffoldOptions, ScaffolderTask } from '@backstage/plugin-scaffolder-react';
import retry from 'async-retry';
import axios, { Axios, AxiosResponse } from 'axios';
import * as https from 'https';

// Define the expected response type from the Developer Hub API
interface ComponentIdResponse {
  id: string;
}

export class DeveloperHub {
  private readonly url: string;
  private readonly axios: Axios;

  public constructor(url: string) {
    if (!url) {
      throw new Error('Cannot initialize DeveloperHubClient without a URL');
    }
    this.url = url;
    this.axios = axios.create({
      httpAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
    });
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
      console.log('Creating component with options:', componentScaffoldOptions);
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
    console.log(`Waiting for component creation task ${taskId} to complete...`);

    // Define the operation that will be retried
    const checkComponentStatus = async (bail: (e: Error) => void): Promise<void> => {
      try {
        // Get the latest task status
        const taskStatus = await this.getComponent(taskId);
        const status = taskStatus.status;

        console.log(`Component creation status: ${status}`);

        // Check if the task has reached a terminal state
        if (status === 'completed') {
          console.log('✅ Component was created successfully!');
          return;
        } else if (status === 'failed' || status === 'cancelled') {
          console.error(`❌ Component creation ${status}.`);

          // Get logs to understand what went wrong
          try {
            const logs = await this.getComponentLogs(taskId);
            console.error('Task logs:', logs);
          } catch (logError) {
            console.error('Failed to retrieve task logs:', logError);
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
          console.warn(`API error while checking component status: ${error.message}`);
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
          console.log(
            `[RETRY ${attempt}/${maxRetries}] 🔄 Task: ${taskId} | Reason: ${error.message}`
          );
        },
      });

      // If we get here, the component was created successfully
      console.log(`Task ${taskId} completed successfully`);
    } catch (error) {
      // Handle terminal errors after max retries
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('failed') || errorMessage.includes('cancelled')) {
        console.error(`Component creation failed or was cancelled: ${errorMessage}`);
        throw new Error(`Component creation failed: ${errorMessage}`);
      } else {
        console.error(
          `Failed to check component status after ${maxRetries} retries: ${errorMessage}`
        );
        throw new Error(`Component creation timed out: ${errorMessage}`);
      }
    }
  }

  /**
   * Deletes entities from Developer Hub by selector
   * @param selector The selector to match entities (e.g., component name)
   * @returns Promise<void>
   */
  public async deleteEntitiesBySelector(selector: string): Promise<void> {
    try {
      console.log(`Deleting entities with selector: ${selector}`);

      // First, get the list of entities that match the selector
      const response = await this.axios.get(
        `${this.url}/api/catalog/entities`,
        {
          params: {
            filter: `metadata.name=${selector}`
          }
        }
      );

      const entities = response.data;
      
      if (!entities || entities.length === 0) {
        console.log(`No entities found with selector: ${selector}`);
        return;
      }

      // Delete each entity
      for (const entity of entities) {
        const entityName = entity.metadata?.name;
        const entityNamespace = entity.metadata?.namespace || 'default';
        
        if (entityName) {
          console.log(`Deleting entity: ${entityName} in namespace: ${entityNamespace}`);
          
          await this.axios.delete(
            `${this.url}/api/catalog/entities/by-name/${entityName}`,
            {
              params: {
                namespace: entityNamespace
              }
            }
          );
          
          console.log(`Successfully deleted entity: ${entityName}`);
        }
      }

      console.log(`Successfully deleted all entities with selector: ${selector}`);
    } catch (error: any) {
      console.error(`Failed to delete entities with selector ${selector}: ${error.message}`);
      throw new Error(`Failed to delete entities with selector ${selector}: ${error.message}`);
    }
  }
}
