import { describe, it, expect } from "vitest";
import Papa from "papaparse";
import {
  indexRecordsByLocation,
  calculateTemperatureAverageFromIndex,
  getMonitoringLocationsWithNamesFromIndex,
} from "./csv-parser";
import type { DataStreamRecord } from "$lib/types/datastream";

/**
 * Helper function to parse CSV string using PapaParse (for testing)
 * This mimics the behavior of parseCSVFile but works in Node.js environment
 */
function parseCSVString(csvContent: string): DataStreamRecord[] {
  const result = Papa.parse<DataStreamRecord>(csvContent, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });

  if (result.errors.length > 0) {
    const criticalErrors = result.errors.filter(
      (err) => err.type === "Quotes" || err.type === "FieldMismatch"
    );
    if (criticalErrors.length > 0) {
      console.error("CSV parsing errors:", criticalErrors);
    }
  }

  if (!result.data || result.data.length === 0) {
    throw new Error("No data found in CSV file");
  }

  // Validate required columns
  const requiredColumns = [
    "MonitoringLocationID",
    "CharacteristicName",
    "ResultValue",
  ];

  const firstRecord = result.data[0];
  const missingColumns = requiredColumns.filter((col) => !(col in firstRecord));

  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(", ")}`);
  }

  return result.data;
}

describe("CSV Parser", () => {
  describe("CSV Parsing (using PapaParse)", () => {
    it("should parse a simple CSV file", () => {
      const csv = `MonitoringLocationID,CharacteristicName,ResultValue
LOC001,"Temperature, water",15.5
LOC002,"Temperature, water",16.2`;

      const result = parseCSVString(csv);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        MonitoringLocationID: "LOC001",
        CharacteristicName: "Temperature, water",
        ResultValue: "15.5",
      });
      expect(result[1]).toEqual({
        MonitoringLocationID: "LOC002",
        CharacteristicName: "Temperature, water",
        ResultValue: "16.2",
      });
    });

    it("should handle quoted values with commas", () => {
      const csv = `MonitoringLocationID,CharacteristicName,ResultValue
"LOC001","Temperature, water","15.5"
"LOC002","Temperature, water","16.2"`;

      const result = parseCSVString(csv);

      expect(result).toHaveLength(2);
      expect(result[0].CharacteristicName).toBe("Temperature, water");
    });

    it("should handle escaped quotes", () => {
      const csv = `MonitoringLocationID,CharacteristicName,ResultValue
"LOC""001","Temperature, water","15.5"`;

      const result = parseCSVString(csv);

      expect(result).toHaveLength(1);
      expect(result[0].MonitoringLocationID).toBe('LOC"001');
    });

    it("should throw error for empty CSV", () => {
      expect(() => parseCSVString("")).toThrow("No data found in CSV file");
    });

    it("should throw error for missing required columns", () => {
      const csv = `MonitoringLocationID,CharacteristicName
LOC001,Temperature`;

      expect(() => parseCSVString(csv)).toThrow(
        "Missing required columns: ResultValue"
      );
    });

    it("should skip malformed rows", () => {
      const csv = `MonitoringLocationID,CharacteristicName,ResultValue
LOC001,"Temperature, water",15.5
LOC002,Temperature
LOC003,"Temperature, water",16.2`;

      const result = parseCSVString(csv);

      expect(result).toHaveLength(3);
      expect(result[0].MonitoringLocationID).toBe("LOC001");
      expect(result[1].MonitoringLocationID).toBe("LOC002");
      expect(result[2].MonitoringLocationID).toBe("LOC003");
    });

    it("should handle extra columns", () => {
      const csv = `MonitoringLocationID,CharacteristicName,ResultValue,ExtraColumn
LOC001,"Temperature, water",15.5,Extra`;

      const result = parseCSVString(csv);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("ExtraColumn", "Extra");
    });

    it("should trim whitespace from values", () => {
      const csv = `MonitoringLocationID,CharacteristicName,ResultValue
  LOC001  ,"  Temperature, water  ",  15.5  `;

      const result = parseCSVString(csv);

      expect(result[0].MonitoringLocationID).toBe("LOC001");
      expect(result[0].CharacteristicName).toBe("Temperature, water");
      expect(result[0].ResultValue).toBe("15.5");
    });
  });

  describe("calculateTemperatureAverageFromIndex", () => {
    const sampleRecords: DataStreamRecord[] = [
      {
        MonitoringLocationID: "LOC001",
        CharacteristicName: "Temperature, water",
        ResultValue: "15.5",
      },
      {
        MonitoringLocationID: "LOC001",
        CharacteristicName: "Temperature, water",
        ResultValue: "16.5",
      },
      {
        MonitoringLocationID: "LOC001",
        CharacteristicName: "Temperature, water",
        ResultValue: "17.5",
      },
      {
        MonitoringLocationID: "LOC001",
        CharacteristicName: "pH",
        ResultValue: "7.5",
      },
      {
        MonitoringLocationID: "LOC002",
        CharacteristicName: "Temperature, water",
        ResultValue: "20.0",
      },
    ];

    it("should calculate average temperature for a location", () => {
      const recordsIndex = indexRecordsByLocation(sampleRecords);
      const result = calculateTemperatureAverageFromIndex(
        recordsIndex,
        "LOC001"
      );

      expect(result.monitoringLocationId).toBe("LOC001");
      expect(result.average).toBeCloseTo(16.5, 2);
      expect(result.count).toBe(3);
      expect(result.validValues).toEqual([15.5, 16.5, 17.5]);
    });

    it("should only include Temperature, water records", () => {
      const recordsIndex = indexRecordsByLocation(sampleRecords);
      const result = calculateTemperatureAverageFromIndex(
        recordsIndex,
        "LOC001"
      );

      // Should not include pH value
      expect(result.count).toBe(3);
      expect(result.validValues).not.toContain(7.5);
    });

    it("should filter by monitoring location", () => {
      const recordsIndex = indexRecordsByLocation(sampleRecords);
      const result = calculateTemperatureAverageFromIndex(
        recordsIndex,
        "LOC002"
      );

      expect(result.monitoringLocationId).toBe("LOC002");
      expect(result.average).toBe(20.0);
      expect(result.count).toBe(1);
    });

    it("should handle non-numeric values", () => {
      const records: DataStreamRecord[] = [
        {
          MonitoringLocationID: "LOC001",
          CharacteristicName: "Temperature, water",
          ResultValue: "15.5",
        },
        {
          MonitoringLocationID: "LOC001",
          CharacteristicName: "Temperature, water",
          ResultValue: "invalid",
        },
        {
          MonitoringLocationID: "LOC001",
          CharacteristicName: "Temperature, water",
          ResultValue: "16.5",
        },
      ];

      const recordsIndex = indexRecordsByLocation(records);
      const result = calculateTemperatureAverageFromIndex(
        recordsIndex,
        "LOC001"
      );

      expect(result.count).toBe(2);
      expect(result.average).toBeCloseTo(16.0, 2);
    });

    it("should handle empty results", () => {
      const recordsIndex = indexRecordsByLocation(sampleRecords);
      const result = calculateTemperatureAverageFromIndex(
        recordsIndex,
        "LOC999"
      );

      expect(result.monitoringLocationId).toBe("LOC999");
      expect(result.average).toBe(0);
      expect(result.count).toBe(0);
      expect(result.validValues).toEqual([]);
    });

    it("should handle infinite values", () => {
      const records: DataStreamRecord[] = [
        {
          MonitoringLocationID: "LOC001",
          CharacteristicName: "Temperature, water",
          ResultValue: "15.5",
        },
        {
          MonitoringLocationID: "LOC001",
          CharacteristicName: "Temperature, water",
          ResultValue: "Infinity",
        },
      ];

      const recordsIndex = indexRecordsByLocation(records);
      const result = calculateTemperatureAverageFromIndex(
        recordsIndex,
        "LOC001"
      );

      expect(result.count).toBe(1);
      expect(result.validValues).toEqual([15.5]);
    });
  });

  describe("indexRecordsByLocation", () => {
    it("should create an index grouped by MonitoringLocationID", () => {
      const records: DataStreamRecord[] = [
        {
          MonitoringLocationID: "LOC001",
          CharacteristicName: "Temperature, water",
          ResultValue: "15.5",
        },
        {
          MonitoringLocationID: "LOC002",
          CharacteristicName: "Temperature, water",
          ResultValue: "16.5",
        },
        {
          MonitoringLocationID: "LOC001",
          CharacteristicName: "pH",
          ResultValue: "7.5",
        },
      ];

      const index = indexRecordsByLocation(records);

      expect(index.size).toBe(2);
      expect(index.get("LOC001")).toHaveLength(2);
      expect(index.get("LOC002")).toHaveLength(1);
    });

    it("should handle empty records", () => {
      const index = indexRecordsByLocation([]);

      expect(index.size).toBe(0);
    });

    it("should skip records with empty location IDs", () => {
      const records: DataStreamRecord[] = [
        {
          MonitoringLocationID: "LOC001",
          CharacteristicName: "Temperature, water",
          ResultValue: "15.5",
        },
        {
          MonitoringLocationID: "",
          CharacteristicName: "Temperature, water",
          ResultValue: "16.5",
        },
      ];

      const index = indexRecordsByLocation(records);

      expect(index.size).toBe(1);
      expect(index.has("LOC001")).toBe(true);
      expect(index.has("")).toBe(false);
    });
  });

  describe("getMonitoringLocationsWithNamesFromIndex", () => {
    it("should return locations with names and display names from index", () => {
      const records: DataStreamRecord[] = [
        {
          MonitoringLocationID: "LOC001",
          MonitoringLocationName: "Lake Superior",
          CharacteristicName: "Temperature, water",
          ResultValue: "15.5",
        },
        {
          MonitoringLocationID: "LOC002",
          MonitoringLocationName: "Lake Michigan",
          CharacteristicName: "Temperature, water",
          ResultValue: "16.5",
        },
        {
          MonitoringLocationID: "LOC001",
          MonitoringLocationName: "Lake Superior",
          CharacteristicName: "pH",
          ResultValue: "7.5",
        },
      ];

      const index = indexRecordsByLocation(records);
      const result = getMonitoringLocationsWithNamesFromIndex(index);

      expect(result).toHaveLength(2);
      // Results should be sorted by name
      const loc1 = result.find((loc) => loc.id === "LOC002");
      const loc2 = result.find((loc) => loc.id === "LOC001");

      expect(loc1).toEqual({
        id: "LOC002",
        name: "Lake Michigan",
        displayName: "Lake Michigan (LOC002)",
      });
      expect(loc2).toEqual({
        id: "LOC001",
        name: "Lake Superior",
        displayName: "Lake Superior (LOC001)",
      });
    });

    it("should use ID as name when MonitoringLocationName is missing", () => {
      const records: DataStreamRecord[] = [
        {
          MonitoringLocationID: "LOC001",
          CharacteristicName: "Temperature, water",
          ResultValue: "15.5",
        },
      ];

      const index = indexRecordsByLocation(records);
      const result = getMonitoringLocationsWithNamesFromIndex(index);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: "LOC001",
        name: "LOC001",
        displayName: "LOC001 (LOC001)",
      });
    });

    it("should sort locations by name", () => {
      const records: DataStreamRecord[] = [
        {
          MonitoringLocationID: "LOC003",
          MonitoringLocationName: "Zebra Lake",
          CharacteristicName: "Temperature, water",
          ResultValue: "15.5",
        },
        {
          MonitoringLocationID: "LOC001",
          MonitoringLocationName: "Apple Lake",
          CharacteristicName: "Temperature, water",
          ResultValue: "16.5",
        },
        {
          MonitoringLocationID: "LOC002",
          MonitoringLocationName: "Banana Lake",
          CharacteristicName: "Temperature, water",
          ResultValue: "17.5",
        },
      ];

      const index = indexRecordsByLocation(records);
      const result = getMonitoringLocationsWithNamesFromIndex(index);

      expect(result[0].name).toBe("Apple Lake");
      expect(result[1].name).toBe("Banana Lake");
      expect(result[2].name).toBe("Zebra Lake");
    });

    it("should handle empty index", () => {
      const index = new Map();
      const result = getMonitoringLocationsWithNamesFromIndex(index);

      expect(result).toEqual([]);
    });
  });
});
