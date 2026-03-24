// Infrastructure client — Tauri IPC adapter for storage domain

import { apiCall } from '@/lib/apiAdapter';
import type { HooksConfiguration } from './types';

/** Information about a database table */
export interface TableInfo {
  name: string;
  row_count?: number;
  columns?: string[];
}

/** Paginated table data result */
export interface TableReadResult {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  page_size: number;
}

/** Result from executing a raw SQL query */
export interface SqlExecuteResult {
  columns?: string[];
  rows?: Record<string, unknown>[];
  rows_affected?: number;
}

/** Primitive types allowed as database cell values */
export type CellValue = string | number | boolean | null;

/**
 * Lists all tables in the SQLite database
 * @returns Promise resolving to an array of table information
 */
export async function storageListTables(): Promise<TableInfo[]> {
  try {
    const result = await apiCall<TableInfo[]>('storage_list_tables');
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Failed to list tables:', error);
    return [];
  }
}

/**
 * Reads table data with pagination
 * @param tableName - Name of the table to read
 * @param page - Page number (1-indexed)
 * @param pageSize - Number of rows per page
 * @param searchQuery - Optional search query
 * @returns Promise resolving to table data with pagination info
 */
export async function storageReadTable(
  tableName: string,
  page: number,
  pageSize: number,
  searchQuery?: string
): Promise<TableReadResult> {
  try {
    return await apiCall<TableReadResult>('storage_read_table', { tableName, page, pageSize, searchQuery });
  } catch (error) {
    // Demote to debug — storage tables may not exist in web mode
    console.debug('Failed to read table:', error);
    throw error;
  }
}

/**
 * Updates a row in a table
 * @param tableName - Name of the table
 * @param primaryKeyValues - Map of primary key column names to values
 * @param updates - Map of column names to new values
 * @returns Promise resolving when the row is updated
 */
export async function storageUpdateRow(
  tableName: string,
  primaryKeyValues: Record<string, CellValue>,
  updates: Record<string, CellValue>
): Promise<void> {
  try {
    return await apiCall<void>('storage_update_row', { tableName, primaryKeyValues, updates });
  } catch (error) {
    console.error('Failed to update row:', error);
    throw error;
  }
}

/**
 * Deletes a row from a table
 * @param tableName - Name of the table
 * @param primaryKeyValues - Map of primary key column names to values
 * @returns Promise resolving when the row is deleted
 */
export async function storageDeleteRow(
  tableName: string,
  primaryKeyValues: Record<string, CellValue>
): Promise<void> {
  try {
    return await apiCall<void>('storage_delete_row', { tableName, primaryKeyValues });
  } catch (error) {
    console.error('Failed to delete row:', error);
    throw error;
  }
}

/**
 * Inserts a new row into a table
 * @param tableName - Name of the table
 * @param values - Map of column names to values
 * @returns Promise resolving to the last insert row ID
 */
export async function storageInsertRow(
  tableName: string,
  values: Record<string, CellValue>
): Promise<number> {
  try {
    return await apiCall<number>('storage_insert_row', { tableName, values });
  } catch (error) {
    console.error('Failed to insert row:', error);
    throw error;
  }
}

/**
 * Executes a raw SQL query
 * @param query - SQL query string
 * @returns Promise resolving to query result
 */
export async function storageExecuteSql(query: string): Promise<SqlExecuteResult> {
  try {
    return await apiCall<SqlExecuteResult>('storage_execute_sql', { query });
  } catch (error) {
    console.error('Failed to execute SQL:', error);
    throw error;
  }
}

/**
 * Resets the entire database
 * @returns Promise resolving when the database is reset
 */
export async function storageResetDatabase(): Promise<void> {
  try {
    return await apiCall<void>('storage_reset_database');
  } catch (error) {
    console.error('Failed to reset database:', error);
    throw error;
  }
}

/**
 * Gets a setting from the app_settings table
 * @param key - The setting key to retrieve
 * @returns Promise resolving to the setting value or null if not found
 */
export async function getSetting(key: string): Promise<string | null> {
  try {
    // Fast path: check localStorage mirror to avoid startup flicker
    if (typeof window !== 'undefined' && 'localStorage' in window) {
      const cached = window.localStorage.getItem(`app_setting:${key}`);
      if (cached !== null) {
        return cached;
      }
    }
    // Use storageReadTable to safely query the app_settings table
    const result = await storageReadTable('app_settings', 1, 1000);
    const setting = result?.data?.find((row) => row.key === key);
    const value = setting?.value;
    return typeof value === 'string' ? value : null;
  } catch (error) {
    // Expected to fail in web mode where storage tables may not exist
    console.debug(`[API] getSetting('${key}') unavailable:`, error);
    return null;
  }
}

/**
 * Saves a setting to the app_settings table (insert or update)
 * @param key - The setting key
 * @param value - The setting value
 * @returns Promise resolving when the setting is saved
 */
export async function saveSetting(key: string, value: string): Promise<void> {
  try {
    // Mirror to localStorage for instant availability on next startup
    if (typeof window !== 'undefined' && 'localStorage' in window) {
      try {
        window.localStorage.setItem(`app_setting:${key}`, value);
      } catch (_ignore) {
        // best-effort; continue to persist in DB
      }
    }
    // Try to update first
    try {
      await storageUpdateRow('app_settings', { key }, { value });
    } catch {
      // If update fails (row doesn't exist), insert new row
      await storageInsertRow('app_settings', { key, value });
    }
  } catch (error) {
    console.error(`Failed to save setting ${key}:`, error);
    throw error;
  }
}

/**
 * Get hooks configuration for a specific scope
 * @param scope - The configuration scope: 'user', 'project', or 'local'
 * @param projectPath - Project path (required for project and local scopes)
 * @returns Promise resolving to the hooks configuration
 */
export async function getHooksConfig(
  scope: 'user' | 'project' | 'local',
  projectPath?: string
): Promise<HooksConfiguration> {
  try {
    return await apiCall<HooksConfiguration>('get_hooks_config', { scope, projectPath });
  } catch (error) {
    console.error('Failed to get hooks config:', error);
    throw error;
  }
}

/**
 * Update hooks configuration for a specific scope
 * @param scope - The configuration scope: 'user', 'project', or 'local'
 * @param hooks - The hooks configuration to save
 * @param projectPath - Project path (required for project and local scopes)
 * @returns Promise resolving to success message
 */
export async function updateHooksConfig(
  scope: 'user' | 'project' | 'local',
  hooks: HooksConfiguration,
  projectPath?: string
): Promise<string> {
  try {
    return await apiCall<string>('update_hooks_config', { scope, projectPath, hooks });
  } catch (error) {
    console.error('Failed to update hooks config:', error);
    throw error;
  }
}

/**
 * Validate a hook command syntax
 * @param command - The shell command to validate
 * @returns Promise resolving to validation result
 */
export async function validateHookCommand(
  command: string
): Promise<{ valid: boolean; message: string }> {
  try {
    return await apiCall<{ valid: boolean; message: string }>('validate_hook_command', { command });
  } catch (error) {
    console.error('Failed to validate hook command:', error);
    throw error;
  }
}

/**
 * Get merged hooks configuration (respecting priority)
 * @param projectPath - The project path
 * @returns Promise resolving to merged hooks configuration
 */
export async function getMergedHooksConfig(projectPath: string): Promise<HooksConfiguration> {
  try {
    const [userHooks, projectHooks, localHooks] = await Promise.all([
      getHooksConfig('user'),
      getHooksConfig('project', projectPath),
      getHooksConfig('local', projectPath),
    ]);

    // Import HooksManager for merging
    const { HooksManager } = await import('@/lib/hooksManager');
    return HooksManager.mergeConfigs(userHooks, projectHooks, localHooks);
  } catch (error) {
    console.error('Failed to get merged hooks config:', error);
    throw error;
  }
}
