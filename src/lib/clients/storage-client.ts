/**
 * Storage client — SQLite table operations, raw SQL execution,
 * and the app_settings key-value helpers.
 */
import { apiCall } from '../apiAdapter';

/**
 * Lists all tables in the SQLite database
 */
export async function storageListTables(): Promise<unknown[]> {
  try {
    const result = await apiCall<unknown[]>('storage_list_tables');
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
 */
export async function storageReadTable(
  tableName: string,
  page: number,
  pageSize: number,
  searchQuery?: string
): Promise<unknown> {
  try {
    return await apiCall<unknown>('storage_read_table', {
      tableName,
      page,
      pageSize,
      searchQuery,
    });
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
 */
export async function storageUpdateRow(
  tableName: string,
  primaryKeyValues: Record<string, unknown>,
  updates: Record<string, unknown>
): Promise<void> {
  try {
    return await apiCall<void>('storage_update_row', {
      tableName,
      primaryKeyValues,
      updates,
    });
  } catch (error) {
    console.error('Failed to update row:', error);
    throw error;
  }
}

/**
 * Deletes a row from a table
 * @param tableName - Name of the table
 * @param primaryKeyValues - Map of primary key column names to values
 */
export async function storageDeleteRow(
  tableName: string,
  primaryKeyValues: Record<string, unknown>
): Promise<void> {
  try {
    return await apiCall<void>('storage_delete_row', {
      tableName,
      primaryKeyValues,
    });
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
  values: Record<string, unknown>
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
 */
export async function storageExecuteSql(query: string): Promise<unknown> {
  try {
    return await apiCall<unknown>('storage_execute_sql', { query });
  } catch (error) {
    console.error('Failed to execute SQL:', error);
    throw error;
  }
}

/**
 * Resets the entire database
 */
export async function storageResetDatabase(): Promise<void> {
  try {
    return await apiCall<void>('storage_reset_database');
  } catch (error) {
    console.error('Failed to reset database:', error);
    throw error;
  }
}

// App settings key-value helpers

/**
 * Gets a setting from the app_settings table.
 * Uses a localStorage mirror to avoid startup flicker.
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
    const setting = (result as { data?: Array<{ key: string; value: string }> })?.data?.find((row) => row.key === key);
    return setting?.value || null;
  } catch (error) {
    // Expected to fail in web mode where storage tables may not exist
    console.debug(`[API] getSetting('${key}') unavailable:`, error);
    return null;
  }
}

/**
 * Saves a setting to the app_settings table (insert or update).
 * Mirrors to localStorage for instant availability on next startup.
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
