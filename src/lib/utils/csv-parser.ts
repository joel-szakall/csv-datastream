/**
 * CSV parser using PapaParse library
 * Optimized for client-side processing using web workers and indexing
 */

import Papa from "papaparse";
import type {
  DataStreamRecord,
  TemperatureResult,
  MonitoringLocation,
} from "$lib/types/datastream";

/**
 * Progress callback for CSV parsing
 */
export type ParseProgressCallback = (progress: {
  bytesProcessed: number;
  totalBytes: number;
  percentage: number;
}) => void;

/**
 * Parse CSV file into records
 */
export function parseCSVFile(
  file: File,
  options: {
    useWorker?: boolean;
    onProgress?: ParseProgressCallback;
  } = {}
): Promise<DataStreamRecord[]> {
  const { useWorker = false, onProgress } = options;

  return new Promise((resolve, reject) => {
    const allRecords: DataStreamRecord[] = [];
    const totalBytes = file.size;
    let bytesProcessed = 0;

    const parseConfig: any = {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      worker: useWorker,
      chunk: (results: Papa.ParseResult<DataStreamRecord>) => {
        if (results.data && results.data.length > 0) {
          const trimmedData = useWorker
            ? results.data.map((row: any) => {
                const trimmedRow: any = {};
                for (const key in row) {
                  const trimmedKey = key.trim();
                  trimmedRow[trimmedKey] =
                    typeof row[key] === "string" ? row[key].trim() : row[key];
                }
                return trimmedRow as DataStreamRecord;
              })
            : results.data;

          allRecords.push(...trimmedData);
        }

        if (onProgress && results.meta.cursor !== undefined) {
          bytesProcessed = results.meta.cursor;
          const percentage = Math.floor((bytesProcessed / totalBytes) * 100);
          onProgress({
            bytesProcessed,
            totalBytes,
            percentage,
          });
        }

        if (results.errors.length > 0) {
          console.error("CSV parsing errors", results.errors);
        }
      },
      complete: () => {
        // Final progress update
        if (onProgress) {
          onProgress({
            bytesProcessed: totalBytes,
            totalBytes,
            percentage: 100,
          });
        }

        // Validate results
        if (allRecords.length === 0) {
          reject(new Error("No data found in CSV file"));
          return;
        }

        // Validate required columns
        const requiredColumns = [
          "MonitoringLocationID",
          "CharacteristicName",
          "ResultValue",
        ];

        const firstRecord = allRecords[0];
        const missingColumns = requiredColumns.filter(
          (col) => !(col in firstRecord)
        );

        if (missingColumns.length > 0) {
          reject(
            new Error(`Missing required columns: ${missingColumns.join(", ")}`)
          );
          return;
        }

        resolve(allRecords);
      },
      error: (error: any) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      },
    };

    Papa.parse<DataStreamRecord>(file, parseConfig);
  });
}

/**
 * Create an indexed map of records grouped by MonitoringLocationID
 */
export function indexRecordsByLocation(
  records: DataStreamRecord[]
): Map<string, DataStreamRecord[]> {
  const locationMap = new Map<string, DataStreamRecord[]>();

  // to further optimize, we could use a web worker here as well to offload this work to a separate thread
  // but for the purposes of this assessment I will leave it at this
  for (const record of records) {
    const locationId = record.MonitoringLocationID;
    if (!locationId) continue;

    if (!locationMap.has(locationId)) {
      locationMap.set(locationId, []);
    }
    locationMap.get(locationId)!.push(record);
  }

  return locationMap;
}

/**
 * Calculate average temperature using indexed data
 */
export function calculateTemperatureAverageFromIndex(
  recordsIndex: Map<string, DataStreamRecord[]>,
  monitoringLocationId: string
): TemperatureResult {
  const validValues: number[] = [];

  const locationRecords = recordsIndex.get(monitoringLocationId) || [];

  for (const record of locationRecords) {
    if (record.CharacteristicName === "Temperature, water") {
      const value = parseFloat(record.ResultValue);

      if (!isNaN(value) && isFinite(value)) {
        validValues.push(value);
      }
    }
  }

  const average =
    validValues.length > 0
      ? validValues.reduce((sum, val) => sum + val, 0) / validValues.length
      : 0;

  return {
    monitoringLocationId,
    average,
    count: validValues.length,
    validValues,
  };
}

/**
 * Get unique monitoring locations with names from indexed data
 */
export function getMonitoringLocationsWithNamesFromIndex(
  recordsIndex: Map<string, DataStreamRecord[]>
): MonitoringLocation[] {
  const locations: MonitoringLocation[] = [];

  for (const [locationId, locationRecords] of recordsIndex.entries()) {
    // Get the first record for this location to extract the name
    const firstRecord = locationRecords[0];
    const name = firstRecord.MonitoringLocationName || locationId;

    locations.push({
      id: locationId,
      name,
      displayName: `${name} (${locationId})`,
    });
  }

  return locations.sort((a, b) => a.name.localeCompare(b.name));
}
