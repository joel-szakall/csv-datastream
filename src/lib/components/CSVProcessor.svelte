<!--
 * CSVProcessor.svelte
 *
 * A component for processing DataStream CSV files and calculating
 * water temperature averages by monitoring location.
 *
 * @component
 *
 * Props:
 * @prop {string} [class] - Additional CSS classes to apply to the root element
 * @prop {boolean} [useWorker=true] - Enable/disable Web Worker for CSV parsing
 -->



<script lang="ts">
	// Imports
	import type { DataStreamRecord, TemperatureResult, MonitoringLocation } from '$lib/types/datastream';
	import {
		parseCSVFile,
		indexRecordsByLocation,
		calculateTemperatureAverageFromIndex,
		getMonitoringLocationsWithNamesFromIndex
	} from '$lib/utils/csv-parser';
	import { browser } from '$app/environment';
	import Papa from 'papaparse';

	// Props
	interface Props {
		class?: string;
		useWorker?: boolean; // Option to enable/disable worker
	}

	let { class: className = '', useWorker = true }: Props = $props();

	// State 
	let file = $state<File | null>(null);
	let records = $state<DataStreamRecord[]>([]);
	let recordsIndex = $state<Map<string, DataStreamRecord[]>>(new Map());
	let monitoringLocations = $state<MonitoringLocation[]>([]);
	let selectedLocation = $state<string>('');
	let result = $state<TemperatureResult | null>(null);
	let isProcessing = $state(false);
	let error = $state<string | null>(null);
	let fileInputElement = $state<HTMLInputElement | null>(null);
	let parseProgress = $state<number>(0);
	let totalRows = $state<number>(0);
	let searchQuery = $state<string>('');
	let isDropdownOpen = $state(false);
	let searchInputElement = $state<HTMLInputElement | null>(null);

	// Derived State/Computed properties
	const hasData = $derived(records.length > 0);
	const workerAvailable = $derived(browser && Papa.WORKERS_SUPPORTED && useWorker);
	const showProgress = $derived(isProcessing && parseProgress > 0);
	const filteredLocations = $derived(
		searchQuery.trim() === ''
			? monitoringLocations
			: monitoringLocations.filter(
					(loc) =>
						loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
						loc.id.toLowerCase().includes(searchQuery.toLowerCase())
			  )
	);

	/**
	 * Handle file selection changes and validation
	 */
	async function handleFileChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const selectedFile = target.files?.[0];

		if (!selectedFile) {
			return;
		}

		// Validate file type
		if (!selectedFile.name.endsWith('.csv')) {
			error = 'Please select a CSV file';
			return;
		}

		file = selectedFile;
		error = null;
		result = null;
		selectedLocation = '';

		await processFile(selectedFile);
	}

	/**
	 * Process the CSV file
	 */
	async function processFile(csvFile: File) {
		isProcessing = true;
		error = null;
		parseProgress = 0;
		totalRows = 0;

		try {
			// Parse CSV file using PapaParse with optional Web Worker support
			// (most modern browsers support web workers but figured we should check just in case someone is using an ancient browser)
			const parsedRecords = await parseCSVFile(csvFile, {
				useWorker: workerAvailable,
				onProgress: (progress) => {
					parseProgress = progress.percentage;
					// Estimate total rows based on average bytes per row
					// This is approximate since we don't know exact row count until parsing is complete
					totalRows = Math.floor(progress.totalBytes / 100); // Rough estimate
				}
			});

			if (parsedRecords.length === 0) {
				throw new Error('No data found in CSV file');
			}

			// store the parsed csv rows/records
			records = parsedRecords;

			// Create indexed map for O(1) lookups by MonitoringLocationID
			// (we make the assumption that the csv file has a MonitoringLocationID column and the schema 
			// is consistent and that the MonitoringLocationID  is the primary column we want to filter/group by)
			recordsIndex = indexRecordsByLocation(parsedRecords);

			// Extract unique monitoring locations for the dropdown list
			const locations = getMonitoringLocationsWithNamesFromIndex(recordsIndex);

			if (locations.length === 0) {
				throw new Error('No monitoring locations found in CSV file');
			}

			monitoringLocations = locations;
			selectedLocation = '';
			searchQuery = '';
			result = null;
		} catch (err) {
			error = 'Failed to process CSV file';
			console.error(err);
			records = [];
			recordsIndex = new Map();
			monitoringLocations = [];
		} finally {
			isProcessing = false;
			parseProgress = 0;
			totalRows = 0;
		}
	}

	/**
	 * Calculate temperature average for selected location
	 */
	function calculateAverage() {
		if (!selectedLocation || records.length === 0) {
			return;
		}

		error = null;

		try {
			// Use indexed lookup for O(1) performance instead of O(n) linear search
			const calculatedResult = calculateTemperatureAverageFromIndex(recordsIndex, selectedLocation);

			if (calculatedResult.count === 0) {
				error = `No temperature data found for location: ${selectedLocation}`;
				result = null;
			} else {
				result = calculatedResult;
			}
		} catch (err) {
			error ='Failed to calculate average';
			console.error(err);
			result = null;
		}
	}

	/**
	 * Reset the component
	 */
	function reset() {
		file = null;
		records = [];
		recordsIndex = new Map();
		monitoringLocations = [];
		selectedLocation = '';
		result = null;
		error = null;

		if (fileInputElement) {
			fileInputElement.value = '';
		}
	}

	/**
	 * Handle click outside to close dropdown
	 */
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.location-dropdown')) {
			isDropdownOpen = false;
		}
	}

	/**
	 * Handle focus on search input - select all text if there's a value
	 */
	function handleSearchFocus() {
		isDropdownOpen = true;
		// If there's already a selected value, select all text for easy replacement
		if (searchQuery && searchInputElement) {
			searchInputElement.select();
		}
	}

	/**
	 * Clear the search input and selection
	 */
	function clearSearch() {
		searchQuery = '';
		selectedLocation = '';
		result = null;
		isDropdownOpen = true;
		// Focus back on the input
		if (searchInputElement) {
			searchInputElement.focus();
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class={`w-full max-w-4xl mx-auto p-6 space-y-6 ${className}`}>
	<!-- Header -->
	<div class="text-center space-y-2">
		<h1 class="text-3xl font-bold text-gray-900">DataStream CSV Processor</h1>
		<p class="text-gray-600">
			Upload a DataStream-formatted CSV file to calculate average water temperature by monitoring location.
		</p>
	</div>

	<!-- File Upload Section -->
	<div class="bg-white rounded-lg shadow-md p-6 space-y-4">
		<div class="space-y-2">
			<label for="csv-file" class="block text-sm font-medium text-gray-700">
				Select CSV File
			</label>
			<div class="flex gap-3">
				<input
					id="csv-file"
					type="file"
					accept=".csv"
					onchange={handleFileChange}
					bind:this={fileInputElement}
					disabled={isProcessing}
					class="flex-1 block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
				/>
				{#if file}
					<button
						type="button"
						onclick={reset}
						disabled={isProcessing}
						class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						Reset
					</button>
				{/if}
			</div>
		</div>

		{#if file}
			<div class="text-sm text-gray-600">
				<span class="font-medium">File:</span>
				{file.name}
				<span class="ml-2">({(file.size / 1024).toFixed(2)} KB)</span>
			</div>
		{/if}

		{#if isProcessing}
			<div class="space-y-3">
				<div class="flex items-center gap-2 text-blue-600">
					<svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					<span class="text-sm font-medium">
						{#if showProgress}
							Processing CSV file... {parseProgress}%
						{:else}
							Processing CSV file...
						{/if}
					</span>
				</div>

				{#if showProgress}
					<div class="w-full bg-gray-200 rounded-full h-2.5">
						<div
							class="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
							style="width: {parseProgress}%"
						></div>
					</div>
					<p class="text-xs text-gray-600">
						Processing CSV file... Please wait.
					</p>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Location Selection -->
	{#if hasData && !isProcessing}
		<div class="bg-white rounded-lg shadow-md p-6 space-y-4">
			<div class="space-y-2 relative location-dropdown">
				<label for="location-search" class="block text-sm font-medium text-gray-700">
					Monitoring Location
				</label>

				<!-- Search Input -->
				<div class="relative">
					<input
						id="location-search"
						type="text"
						bind:this={searchInputElement}
						bind:value={searchQuery}
						onfocus={handleSearchFocus}
						placeholder="Select a monitoring location..."
						class="block w-full px-3 py-2 pr-20 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						autocomplete="off"
					/>

					<!-- Clear Button -->
					{#if searchQuery}
						<button
							type="button"
							onclick={clearSearch}
							class="absolute right-10 top-2.5 h-5 w-5 text-gray-400 hover:text-gray-600 focus:outline-none"
							aria-label="Clear search"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					{/if}

					<!-- Search Icon -->
					<svg
						class="absolute right-3 top-2.5 h-5 w-5 text-gray-400 pointer-events-none"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
				</div>

				<!-- Dropdown List -->
				{#if isDropdownOpen && filteredLocations.length > 0}
					<div class="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
						{#each filteredLocations as location}
							<button
								type="button"
								onclick={() => {
									selectedLocation = location.id;
									searchQuery = location.displayName;
									isDropdownOpen = false;
									calculateAverage();
								}}
								class="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none border-b border-gray-100 last:border-b-0"
							>
								<div class="font-medium text-gray-900">{location.name}</div>
								<div class="text-xs text-gray-500">{location.id}</div>
							</button>
						{/each}
					</div>
				{/if}

				{#if isDropdownOpen && filteredLocations.length === 0 && searchQuery.trim() !== ''}
					<div class="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3">
						<p class="text-sm text-gray-500">No locations found</p>
					</div>
				{/if}
			</div>

			<div class="text-sm text-gray-600">
				<span class="font-medium">Total Records:</span>
				{records.length.toLocaleString()}
				<span class="ml-4 font-medium">Locations:</span>
				{monitoringLocations.length}
			</div>
		</div>
	{/if}

	<!-- Results Display -->
	{#if result && !isProcessing}
		<div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-md p-6 space-y-4">
			<h2 class="text-xl font-semibold text-gray-900">Results</h2>

			<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
				<div class="bg-white rounded-lg p-4 shadow-sm md:col-span-2">
					<div class="text-sm font-medium text-gray-600">Monitoring Location</div>
					<div class="mt-1 text-base font-semibold text-gray-900">
						{monitoringLocations.find(loc => loc.id === result?.monitoringLocationId)?.name || result?.monitoringLocationId}
					</div>
					<div class="mt-0.5 text-xs text-gray-500">
						{result?.monitoringLocationId}
					</div>
				</div>

				<div class="bg-white rounded-lg p-4 shadow-sm">
					<div class="text-sm font-medium text-gray-600">Average Temperature</div>
					<div class="mt-1 text-3xl font-bold text-blue-600">
						{result.average.toFixed(2)}°
					</div>
				</div>

				<div class="bg-white rounded-lg p-4 shadow-sm">
					<div class="text-sm font-medium text-gray-600">Data Points</div>
					<div class="mt-1 text-lg font-semibold text-gray-900">
						{result.count.toLocaleString()}
					</div>
				</div>

				{#if result.count > 0}
					<div class="bg-white rounded-lg p-4 shadow-sm md:col-span-4">
						<div class="text-sm font-medium text-gray-600 mb-3">Temperature Statistics</div>
						<div class="grid grid-cols-3 gap-4 text-sm">
							<div>
								<span class="font-medium text-gray-700">Min:</span>
								<span class="ml-1 text-gray-900">{Math.min(...result.validValues).toFixed(2)}°</span>
							</div>
							<div>
								<span class="font-medium text-gray-700">Max:</span>
								<span class="ml-1 text-gray-900">{Math.max(...result.validValues).toFixed(2)}°</span>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Error Display -->
	{#if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4">
			<div class="flex items-start gap-3">
				<svg class="w-5 h-5 text-red-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
					<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
				</svg>
				<div class="flex-1">
					<h3 class="text-sm font-medium text-red-800">Error</h3>
					<p class="mt-1 text-sm text-red-700">{error}</p>
				</div>
			</div>
		</div>
	{/if}
</div>

