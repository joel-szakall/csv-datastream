import { page } from "@vitest/browser/context";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-svelte";
import CSVProcessor from "./CSVProcessor.svelte";

describe("CSVProcessor Component", () => {
  it("should render the component with title", async () => {
    render(CSVProcessor);

    const heading = page.getByRole("heading", { level: 1 });
    await expect.element(heading).toBeInTheDocument();
    await expect.element(heading).toHaveTextContent("DataStream CSV Processor");
  });

  it("should render file input", async () => {
    render(CSVProcessor);

    const fileInput = page.getByLabelText("Select CSV File");
    await expect.element(fileInput).toBeInTheDocument();
    await expect.element(fileInput).toHaveAttribute("type", "file");
    await expect.element(fileInput).toHaveAttribute("accept", ".csv");
  });

  it("should show file name after selection", async () => {
    render(CSVProcessor);

    const csvContent = `MonitoringLocationID,CharacteristicName,ResultValue
LOC001,"Temperature, water",15.5
LOC001,"Temperature, water",16.5`;

    const file = new File([csvContent], "test.csv", { type: "text/csv" });
    const fileInput = page.getByLabelText("Select CSV File");

    const input = (await fileInput.element()) as HTMLInputElement;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check if file name is displayed
    const fileName = page.getByText("test.csv");
    await expect.element(fileName).toBeInTheDocument();
  });

  it("should display results after processing valid CSV", async () => {
    render(CSVProcessor);

    const csvContent = `MonitoringLocationID,CharacteristicName,ResultValue
LOC001,"Temperature, water",15.5
LOC001,"Temperature, water",16.5
LOC001,"Temperature, water",17.5`;

    const file = new File([csvContent], "test.csv", { type: "text/csv" });
    const fileInput = page.getByLabelText("Select CSV File");

    const input = (await fileInput.element()) as HTMLInputElement;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Select a location first
    const locationInput = page.getByLabelText("Monitoring Location");
    await locationInput.click();

    // Wait for dropdown to open
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Click on the first location option (use role to be more specific)
    const locationOption = page.getByRole("button", { name: /LOC001/ });
    await locationOption.click();

    // Wait for calculation
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Check for results heading
    const resultsHeading = page.getByRole("heading", {
      level: 2,
      name: "Results",
    });
    await expect.element(resultsHeading).toBeInTheDocument();

    // Check for average temperature (should be 16.5)
    const avgTemp = page.getByText("16.50°");
    await expect.element(avgTemp).toBeInTheDocument();
  });

  it("should show error for invalid CSV", async () => {
    render(CSVProcessor);

    const csvContent = `InvalidHeader1,InvalidHeader2
value1,value2`;

    const file = new File([csvContent], "invalid.csv", { type: "text/csv" });
    const fileInput = page.getByLabelText("Select CSV File");

    const input = (await fileInput.element()) as HTMLInputElement;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check for error message
    const errorHeading = page.getByRole("heading", { level: 3, name: "Error" });
    await expect.element(errorHeading).toBeInTheDocument();
  });

  it("should allow location selection", async () => {
    render(CSVProcessor);

    const csvContent = `MonitoringLocationID,CharacteristicName,ResultValue
LOC001,"Temperature, water",15.5
LOC002,"Temperature, water",20.0`;

    const file = new File([csvContent], "test.csv", { type: "text/csv" });
    const fileInput = page.getByLabelText("Select CSV File");

    const input = (await fileInput.element()) as HTMLInputElement;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Check for location input (it's a searchable input, not a select)
    const locationInput = page.getByLabelText("Monitoring Location");
    await expect.element(locationInput).toBeInTheDocument();

    // Verify the input is enabled and ready
    const input2 = (await locationInput.element()) as HTMLInputElement;
    expect(input2.disabled).toBe(false);
  });

  it("should reset when reset button is clicked", async () => {
    render(CSVProcessor);

    const csvContent = `MonitoringLocationID,CharacteristicName,ResultValue
LOC001,"Temperature, water",15.5`;

    const file = new File([csvContent], "test.csv", { type: "text/csv" });
    const fileInput = page.getByLabelText("Select CSV File");

    const input = (await fileInput.element()) as HTMLInputElement;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify file is loaded
    const fileName = page.getByText("test.csv");
    await expect.element(fileName).toBeInTheDocument();

    // Click reset button
    const resetButton = page.getByRole("button", { name: "Reset" });
    await resetButton.click();

    // Wait for reset
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify file name is cleared
    await expect.element(fileName).not.toBeInTheDocument();
  });

  it("should render with Web Worker support", async () => {
    render(CSVProcessor);

    // Just verify the component renders without errors
    // Web Worker indicator presence depends on browser support
    const heading = page.getByRole("heading", { level: 1 });
    await expect.element(heading).toBeInTheDocument();
  });
});
