/**
 * Shared kernel — ProjectId re-export.
 *
 * The canonical ProjectId class VO lives in the project bounded context.
 * This file exists for backward-compat imports by contexts that need the type
 * without depending on the full project domain module.
 */
export { ProjectId, toProjectId } from '../project/types';
