import { CIType } from '../../src/rhtap/core/integration/ci';
import { GitType } from '../../src/rhtap/core/integration/git';
import { TemplateType } from '../../src/rhtap/core/integration/git';
import { ImageRegistryType } from '../../src/rhtap/core/integration/registry';
import { randomString } from '../utils/util';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { lock } from 'proper-lockfile';
import { PROJECT_CONFIGS_FILE } from '../constants';
import { LoggerFactory, Logger } from '../logger/logger';

export class TestItem {
  private readonly logger: Logger;
  private name: string;
  private template: TemplateType;
  private registryType: ImageRegistryType;
  private gitType: GitType;
  private ciType: CIType;
  private tpa: string;
  private acs: string;
  /** Plan name for unique project config naming (e.g. test plan name or 'legacy') */
  private planName: string;

  constructor(
    name: string,
    template: TemplateType,
    registryType: ImageRegistryType,
    gitType: GitType,
    ciType: CIType,
    tpa: string = '',
    acs: string = '',
    planName: string = 'legacy'
  ) {
    this.logger = LoggerFactory.getLogger('playwright.testItem');
    this.name = name;
    this.template = template;
    this.registryType = registryType;
    this.gitType = gitType;
    this.ciType = ciType;
    this.tpa = tpa;
    this.acs = acs;
    this.planName = planName;
  }

  // Getters
  public getName(): string {
    return this.name;
  }

  public getTemplate(): TemplateType {
    return this.template;
  }

  public getRegistryType(): ImageRegistryType {
    return this.registryType;
  }

  public getGitType(): GitType {
    return this.gitType;
  }

  public getCIType(): CIType {
    return this.ciType;
  }

  public getTPA(): string {
    return this.tpa;
  }

  public getACS(): string {
    return this.acs;
  }

  public getPlanName(): string {
    return this.planName;
  }

  // Setters
  public setName(name: string): void {
    this.name = name;
  }

  public setTemplate(template: TemplateType): void {
    this.template = template;
  }

  public setRegistryType(registryType: ImageRegistryType): void {
    this.registryType = registryType;
  }

  public setGitType(gitType: GitType): void {
    this.gitType = gitType;
  }

  public setCIType(ciType: CIType): void {
    this.ciType = ciType;
  }

  public setTPA(tpa: string): void {
    this.tpa = tpa;
  }

  public setACS(acs: string): void {
    this.acs = acs;
  }

  public setPlanName(planName: string): void {
    this.planName = planName;
  }

  /**
   * Regenerates the component name with a new random suffix.
   * This is useful when component creation fails due to name conflicts
   * and a fresh name is needed for retry.
   * 
   * Example: "backend-tests-python-abc123" -> "backend-tests-python-xyz789"
   * 
   * @returns The new generated name
   */
  public regenerateName(): string {
    const currentName = this.name;
    const lastHyphenIndex = currentName.lastIndexOf('-');
    
    const baseName = lastHyphenIndex > 0
      ? currentName.substring(0, lastHyphenIndex)
      : currentName;
    
    const newRandomSuffix = randomString(8);
    this.name = `${baseName}-${newRandomSuffix}`;
    
    this.logger.info(`Regenerated component name: '${currentName}' -> '${this.name}'`);
    return this.name;
  }

  /**
   * Gets the base name (without the random suffix) for identification.
   */
  public getBaseName(): string {
    const lastHyphenIndex = this.name.lastIndexOf('-');
    return lastHyphenIndex > 0 ? this.name.substring(0, lastHyphenIndex) : this.name;
  }

  /**
   * Saves the current component name to existing project-configs.json.
   *
   * IMPORTANT: Matches by exact config (template + gitType + ciType + registryType)
   * to avoid conflicts when multiple workers run in parallel with same base name.
   *
   * @throws Error if the file is missing, no matching config entry, write/lock fails
   */
  public async saveComponentName(): Promise<void> {
    const filePath = PROJECT_CONFIGS_FILE;
    const lockfilePath = `${filePath}.lock`;
    let release: (() => Promise<void>) | undefined;

    try {
      if (!existsSync(filePath)) {
        const msg = `Project configs file not found: ${filePath}`;
        this.logger.error(msg);
        throw new Error(msg);
      }

      // Acquire a lock to prevent race conditions
      release = await lock(filePath, { lockfilePath, retries: 5 });
      this.logger.info(`Acquired lock for ${filePath}`);

      // Re-read file to get latest state
      const configs = JSON.parse(readFileSync(filePath, 'utf-8'));

      // Find and update the matching testItem by EXACT config match only
      // (template + gitType + ciType + registryType) to avoid cross-worker conflicts
      let updated = false;
      for (const config of configs) {
        if (config.testItem) {
          if (config.testItem.template === this.template &&
              config.testItem.gitType === this.gitType &&
              config.testItem.ciType === this.ciType &&
              config.testItem.registryType === this.registryType) {
            const oldName = config.testItem.name;
            config.testItem.name = this.name;
            updated = true;
            this.logger.info(`Updated component name in project-configs.json: '${oldName}' -> '${this.name}' (config: ${this.template}/${this.gitType}/${this.ciType}/${this.registryType})`);
            break;
          }
        }
      }

      if (updated) {
        writeFileSync(filePath, JSON.stringify(configs, null, 2));
        this.logger.info(`Updated project configs file: ${filePath}`);
        return;
      }
      const msg = `Could not find matching config to update for: ${this.name} (config: ${this.template}/${this.gitType}/${this.ciType}/${this.registryType})`;
      this.logger.error(msg);
      throw new Error(msg);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Project configs file not found')) {
        throw error;
      }
      if (error instanceof Error && error.message.startsWith('Could not find matching config')) {
        throw error;
      }
      this.logger.error(`Failed to save component name with lock: ${error}`);
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      // Only release if acquired the lock
      if (release) {
        await release();
        this.logger.info(`Released lock for ${filePath}`);
      }
    }
  }

  /**
   * Convert the TestItem to a JSON-serializable object
   */
  public toJSON(): object {
    return {
      name: this.name,
      template: this.template,
      registryType: this.registryType,
      gitType: this.gitType,
      ciType: this.ciType,
      tpa: this.tpa,
      acs: this.acs,
      planName: this.planName,
    };
  }

  /**
   * Create a TestItem from a JSON object
   */
  public static fromJSON(data: Record<string, unknown>): TestItem {
    return new TestItem(
      data.name as string,
      data.template as TemplateType,
      data.registryType as ImageRegistryType,
      data.gitType as GitType,
      data.ciType as CIType,
      (data.tpa as string) ?? '',
      (data.acs as string) ?? '',
      (data.planName as string) ?? 'legacy'
    );
  }
}
