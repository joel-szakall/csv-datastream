/**
 * Type definitions for DataStream CSV data
 */

/**
 * Represents a single row of data from a DataStream CSV file.
 *
 * We will assume is always the same structure/schema.
 * Any additional columns that we want to add to the CSV can be added to this interface but for the sake of this
 * assessment we will only focus on the columns that are required to calculate the average temperature.
 *
 */
export interface DataStreamRecord {
  MonitoringLocationID: string;
  CharacteristicName: string;
  ResultValue: string;
  [key: string]: string; // Allow other CSV columns
}

/**
 * Represents a monitoring location with a unique ID and name.
 */
export interface MonitoringLocation {
  id: string;
  name: string;
  displayName: string;
}

/**
 * Results of calculating the average temperature for a specific monitoring location.
 */
export interface TemperatureResult {
  monitoringLocationId: string;
  average: number;
  count: number;
  validValues: number[];
}

/**
 * Results of processing a CSV file.
 */
export interface ProcessingResult {
  success: boolean;
  data?: TemperatureResult;
  error?: string;
  totalRows?: number;
  processedRows?: number;
}
