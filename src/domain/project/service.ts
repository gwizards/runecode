/**
 * Project bounded context — Application Service.
 *
 * Orchestrates use-cases: load aggregate → execute domain command →
 * persist → dispatch events → clear recorded events → return Result.
 *
 * Never contains business rules; those live in ProjectAggregate.
 */

import type { DomainEventBus } from '../shared/event-bus';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { ProjectAggregate, toProjectId } from './types';
import { makeProjectDeleted } from './events';
import type { IProjectRepository } from './repository';

export class ProjectApplicationService {
  constructor(
    private readonly repo: IProjectRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async createProject(
    id: string,
    path: string,
    name: string,
  ): Promise<Result<ProjectAggregate>> {
    try {
      // Guard: reject duplicate paths
      const existing = await this.repo.findByPath(path);
      if (existing !== null) {
        return Err(`A project with path "${path}" already exists`);
      }

      const project = ProjectAggregate.create(id, path, name);
      await this.repo.saveProject(project);
      this.eventBus.dispatch(project.events);
      project.clearEvents();
      return Ok(project);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ─── Open ─────────────────────────────────────────────────────────────────

  async openProject(id: string): Promise<Result<ProjectAggregate>> {
    try {
      const project = await this.repo.getProject(toProjectId(id));
      if (project === null) {
        return Err(`Project "${id}" not found`);
      }

      project.open();
      await this.repo.saveProject(project);
      this.eventBus.dispatch(project.events);
      project.clearEvents();
      return Ok(project);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ─── Rename ───────────────────────────────────────────────────────────────

  async renameProject(id: string, newName: string): Promise<Result<void>> {
    try {
      const project = await this.repo.getProject(toProjectId(id));
      if (project === null) {
        return Err(`Project "${id}" not found`);
      }

      project.rename(newName);
      await this.repo.saveProject(project);
      this.eventBus.dispatch(project.events);
      project.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async deleteProject(id: string): Promise<Result<void>> {
    try {
      const projId  = toProjectId(id);
      const project = await this.repo.getProject(projId);
      if (project === null) {
        return Err(`Project "${id}" not found`);
      }

      const deletedPath = project.path;
      await this.repo.deleteProject(projId);

      // Deletion event is emitted by the service (not the aggregate) because
      // the aggregate no longer exists after deleteProject().
      this.eventBus.dispatch([makeProjectDeleted(id, deletedPath)]);
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ─── Get ──────────────────────────────────────────────────────────────────

  async getProject(id: string): Promise<Result<ProjectAggregate>> {
    try {
      const project = await this.repo.getProject(toProjectId(id));
      if (project === null) {
        return Err(`Project "${id}" not found`);
      }
      return Ok(project);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  async listProjects(): Promise<Result<ProjectAggregate[]>> {
    try {
      const projects = await this.repo.listProjects();
      return Ok(projects);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }
}
