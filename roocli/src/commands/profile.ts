import chalk from "chalk"
import { Command } from "commander"
import { displayConfirmation } from "../utils/display"
import { WebSocketClient } from "../utils/websocket-client"

/**
 * Display profiles with provider information and highlight the active profile
 * @param wsClient The WebSocket client
 * @param profiles Array of profile names
 * @param activeProfile The currently active profile name
 * @param config Optional configuration object containing profile metadata
 */
async function displayProfilesWithProvider(
	wsClient: WebSocketClient,
	profiles: string[],
	activeProfile: string,
	config?: any,
): Promise<void> {
	// Create a map of profile names to their providers
	const profileProviders = new Map<string, string>()

	// If we have config with metadata, extract provider info
	if (config && config.listApiConfigMeta && Array.isArray(config.listApiConfigMeta)) {
		// First, check if the active profile is the current configuration
		const isActiveProfileCurrentConfig = config.currentApiConfigName === activeProfile

		// Store the actual provider from the main config
		const actualProvider = config.apiProvider || "unknown"

		for (const profile of config.listApiConfigMeta) {
			if (profile.name) {
				// For the active profile, always use the actual provider from the main config
				if (profile.name === activeProfile) {
					profileProviders.set(profile.name, actualProvider)
				} else {
					// For other profiles, use the provider from metadata
					profileProviders.set(profile.name, profile.apiProvider || "unknown")
				}
			}
		}
	}

	// Display each profile
	for (const profileName of profiles) {
		// Get provider from our map if available
		const provider = profileProviders.get(profileName) || "unknown"

		// Format the profile string
		let displayText = profileName
		if (profileProviders.has(profileName)) {
			displayText = `name: ${profileName}; provider: ${provider}`
		}

		// If this is the active profile, make it green and bold
		if (profileName === activeProfile) {
			console.log(chalk.bold.green(`${displayText} (active)`))
		} else {
			console.log(displayText)
		}
	}
}

/**
 * Create the list profiles command
 * @param wsClient The WebSocket client
 * @returns The list profiles command
 */
export function listProfilesCommand(wsClient: WebSocketClient): Command {
	return new Command("profiles")
		.description("List all profiles")
		.option("--active", "Show only the active profile")
		.option("--verbose", "Show detailed profile information")
		.action(async (options) => {
			try {
				if (options.active) {
					const activeProfile = await wsClient.sendCommand("getActiveProfile")
					if (!activeProfile) {
						console.log(chalk.blue("\nActive Profile:"))
						console.log("No active profile")
						// Exit immediately after profile command
						process.exit(0)
					}

					// Get the configuration for more details if verbose
					if (options.verbose) {
						const config = await wsClient.sendCommand("getConfiguration")
						console.log(chalk.blue("\nActive Profile:"))
						console.log(JSON.stringify(config, null, 2))
					} else {
						console.log(chalk.blue("\nActive Profile:"))
						console.log(activeProfile)
					}
				} else {
					const profiles = await wsClient.sendCommand("getProfiles")
					// Get the active profile for highlighting
					const activeProfile = await wsClient.sendCommand("getActiveProfile")

					// Get the full configuration once to extract provider information
					const config = await wsClient.sendCommand("getConfiguration")

					if (options.verbose) {
						if (config && config.listApiConfigMeta) {
							const configList = config.listApiConfigMeta
							const formattedProfiles = configList.map((profile: any) => {
								return {
									name: profile.name,
									provider: profile.apiProvider,
									id: profile.id,
									isActive: profile.name === config.currentApiConfigName,
								}
							})
							console.log(chalk.blue("\nProfiles:"))
							console.log(JSON.stringify(formattedProfiles, null, 2))
						} else {
							// Display profiles with provider information
							console.log(chalk.blue("\nProfiles:"))
							await displayProfilesWithProvider(wsClient, profiles, activeProfile, config)
						}
					} else {
						// Display profiles with provider information
						console.log(chalk.blue("\nProfiles:"))
						await displayProfilesWithProvider(wsClient, profiles, activeProfile, config)
					}
				}
				// Exit immediately after profile command
				process.exit(0)
			} catch (error) {
				console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
				process.exit(1)
			}
		})
}

/**
 * Create the create profile command
 * @param wsClient The WebSocket client
 * @returns The create profile command
 */
export function createProfileCommand(wsClient: WebSocketClient): Command {
	return (
		new Command("profile")
			.description("Create a new profile with configuration and permissions")
			.requiredOption("--name <name>", "Profile name")
			.option("--json <json>", "JSON configuration string")
			.option("--file <file>", "Path to JSON configuration file")
			.option("--provider <provider>", "Provider name (e.g., 'openrouter')")
			.option("--model <model>", "Model ID (e.g., 'anthropic/claude-3.7-sonnet')")
			.option("--apikey <apikey>", "API key for the provider")
			.option("--base-url <url>", "Base URL for API (required for openai-compat)")
			.option("--active", "Set the profile as active after creation")
			// Permission options
			.option("--auto-approval <boolean>", "Enable or disable auto-approval for all tools", "true")
			.option("--allow-read <boolean>", "Auto-approve read-only operations", "true")
			.option("--allow-write <boolean>", "Auto-approve write operations", "true")
			.option("--allow-execute <boolean>", "Auto-approve execute operations", "true")
			.option("--allow-browser <boolean>", "Auto-approve browser operations", "true")
			.option("--allow-mcp <boolean>", "Auto-approve MCP operations", "true")
			.option("--allow-mode-switch <boolean>", "Auto-approve mode switch operations", "true")
			.option("--allow-subtasks <boolean>", "Auto-approve subtask operations", "true")
			.option(
				"--allowed-commands <commands>",
				"Comma-separated list of allowed commands (default: '*' for all commands)",
				"*",
			)
			.option("--secure", "Disable all auto-approvals (secure mode)")
			.action(async (options) => {
				try {
					if (!options.name) {
						throw new Error("Profile name is required")
					}

					let config: any = {}

					// First, set up the configuration if provided
					if (options.json) {
						try {
							config = JSON.parse(options.json)
						} catch (error) {
							throw new Error("Invalid JSON format")
						}
					} else if (options.file) {
						// Implementation for reading from file would go here
						throw new Error("File reading not implemented yet")
					} else if (options.provider && options.apikey) {
						// Create a configuration based on the provider
						switch (options.provider.toLowerCase()) {
							case "openrouter": {
								const modelId = options.model || "anthropic/claude-3.7-sonnet"
								config = {
									apiProvider: "openrouter",
									openRouterApiKey: options.apikey,
									openRouterModelId: modelId,
									openRouterBaseUrl: "https://openrouter.ai/api/v1",
									openRouterUseMiddleOutTransform: true,
									modelTemperature: 0,
									// Default model info for Claude 3.7 Sonnet
									openRouterModelInfo: {
										maxTokens: 8192,
										contextWindow: 200000,
										supportsImages: true,
										supportsComputerUse: true,
										supportsPromptCache: true,
										inputPrice: 3.0,
										outputPrice: 15.0,
										cacheWritesPrice: 3.75,
										cacheReadsPrice: 0.3,
									},
								}
								break
							}
							case "anthropic": {
								const modelId = options.model || "claude-3.7-sonnet"
								const baseUrl = options.baseUrl
								config = {
									apiProvider: "anthropic",
									apiKey: options.apikey,
									apiModelId: modelId,
									...(baseUrl && { anthropicBaseUrl: baseUrl }),
								}
								break
							}
							case "openai-compat": {
								const modelId = options.model || "gpt-4o"
								const baseUrl = options.baseUrl || "https://api.openai.com/v1"
								config = {
									apiProvider: "openai",
									openAiApiKey: options.apikey,
									openAiModelId: modelId,
									openAiBaseUrl: baseUrl,
								}
								break
							}
							case "openai": {
								const modelId = options.model || "gpt-4o"
								config = {
									apiProvider: "openai-native",
									openAiNativeApiKey: options.apikey,
									openAiModelId: modelId,
								}
								break
							}
							case "deepseek": {
								const modelId = options.model || "deepseek-coder"
								const baseUrl = options.baseUrl
								config = {
									apiProvider: "deepseek",
									deepSeekApiKey: options.apikey,
									...(baseUrl && { deepSeekBaseUrl: baseUrl }),
								}
								break
							}
							case "gemini": {
								const modelId = options.model || "gemini-1.5-pro"
								const baseUrl = options.baseUrl
								config = {
									apiProvider: "gemini",
									geminiApiKey: options.apikey,
									...(baseUrl && { googleGeminiBaseUrl: baseUrl }),
								}
								break
							}
							case "glama": {
								const modelId = options.model || "glama-1.5"
								config = {
									apiProvider: "glama",
									glamaApiKey: options.apikey,
									glamaModelId: modelId,
								}
								break
							}
							case "mistral": {
								const modelId = options.model || "mistral-large-latest"
								const baseUrl = options.baseUrl
								config = {
									apiProvider: "mistral",
									mistralApiKey: options.apikey,
									...(baseUrl && { mistralCodestralUrl: baseUrl }),
								}
								break
							}
							case "lmstudio": {
								const modelId = options.model || "default"
								const baseUrl = options.baseUrl
								config = {
									apiProvider: "lmstudio",
									lmStudioModelId: modelId,
									...(baseUrl && { lmStudioBaseUrl: baseUrl }),
								}
								break
							}
							case "unbound": {
								const modelId = options.model || "unbound-default"
								config = {
									apiProvider: "unbound",
									unboundApiKey: options.apikey,
									unboundModelId: modelId,
								}
								break
							}
							case "vscode-lm": {
								const modelId = options.model || "default"
								config = {
									apiProvider: "vscode-lm",
									vsCodeLmModelSelector: {
										id: modelId,
									},
								}
								break
							}
							default:
								throw new Error(
									`Provider '${options.provider}' is not supported yet for simplified configuration`,
								)
						}
					}

					// Add the name to the configuration
					config.name = options.name

					// Parse boolean options
					const parseBool = (value: string): boolean => {
						if (value === "true" || value === "yes" || value === "1") return true
						if (value === "false" || value === "no" || value === "0") return false
						return true // Default to true for permissions
					}

					// Set permissions
					if (options.secure) {
						// Secure mode: disable all auto-approvals
						config.autoApprovalEnabled = false
						config.alwaysAllowReadOnly = false
						config.alwaysAllowWrite = false
						config.alwaysAllowExecute = false
						config.alwaysAllowBrowser = false
						config.alwaysAllowMcp = false
						config.alwaysAllowModeSwitch = false
						config.alwaysAllowSubtasks = false
						config.allowedCommands = [] // No commands allowed in secure mode
					} else {
						// Set auto-approval if specified
						if (options.autoApproval !== undefined) {
							config.autoApprovalEnabled = parseBool(options.autoApproval)
						}

						// Set individual permissions with defaults to true unless explicitly disabled
						config.alwaysAllowReadOnly =
							options.allowRead !== undefined ? parseBool(options.allowRead) : true
						config.alwaysAllowWrite =
							options.allowWrite !== undefined ? parseBool(options.allowWrite) : true
						config.alwaysAllowExecute =
							options.allowExecute !== undefined ? parseBool(options.allowExecute) : true
						config.alwaysAllowBrowser =
							options.allowBrowser !== undefined ? parseBool(options.allowBrowser) : true
						config.alwaysAllowMcp = options.allowMcp !== undefined ? parseBool(options.allowMcp) : true
						config.alwaysAllowModeSwitch =
							options.allowModeSwitch !== undefined ? parseBool(options.allowModeSwitch) : true
						config.alwaysAllowSubtasks =
							options.allowSubtasks !== undefined ? parseBool(options.allowSubtasks) : true

						// Set allowed commands
						if (options.allowedCommands !== undefined) {
							if (options.allowedCommands === "*") {
								// Special case: wildcard (all commands allowed)
								config.allowedCommands = ["*"]
							} else {
								// Parse the comma-separated list of commands
								const commands = options.allowedCommands.split(",").map((cmd: string) => cmd.trim())
								config.allowedCommands = commands
							}
						} else {
							// Default to wildcard (all commands allowed)
							config.allowedCommands = ["*"]
						}
					}

					// Set the configuration
					await wsClient.sendCommand("setConfiguration", config)

					// Create the profile
					const profileId = await wsClient.sendCommand("createProfile", options.name)
					console.log(
						chalk.green(`\nProfile Created: Profile "${options.name}" created with ID: ${profileId}`),
					)

					// Set the profile as active if requested
					if (options.active) {
						await wsClient.sendCommand("setActiveProfile", options.name)
						console.log(chalk.green(`Profile "${options.name}" is now active`))
					}
				} catch (error) {
					console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
					process.exit(1)
				}
				// Exit immediately after profile command
				process.exit(0)
			})
	)
}

/**
 * Create the update profile command
 * @param wsClient The WebSocket client
 * @returns The update profile command
 */
export function updateProfileCommand(wsClient: WebSocketClient): Command {
	return (
		new Command("profile")
			.description("Update a profile with new configuration and permissions")
			.requiredOption("--name <name>", "Profile name")
			.option("--active", "Set the profile as active")
			.option("--json <json>", "JSON configuration string")
			.option("--file <file>", "Path to JSON configuration file")
			.option("--provider <provider>", "Provider name (e.g., 'openrouter')")
			.option("--model <model>", "Model ID (e.g., 'anthropic/claude-3.7-sonnet')")
			.option("--apikey <apikey>", "API key for the provider")
			.option("--base-url <url>", "Base URL for API (required for openai-native)")
			// Permission options
			.option("--auto-approval <boolean>", "Enable or disable auto-approval for all tools")
			.option("--allow-read <boolean>", "Auto-approve read-only operations")
			.option("--allow-write <boolean>", "Auto-approve write operations")
			.option("--allow-execute <boolean>", "Auto-approve execute operations")
			.option("--allow-browser <boolean>", "Auto-approve browser operations")
			.option("--allow-mcp <boolean>", "Auto-approve MCP operations")
			.option("--allow-mode-switch <boolean>", "Auto-approve mode switch operations")
			.option("--allow-subtasks <boolean>", "Auto-approve subtask operations")
			.option(
				"--allowed-commands <commands>",
				"Comma-separated list of allowed commands (default: '*' for all commands)",
				"*",
			)
			.option("--secure", "Disable all auto-approvals (secure mode)")
			.action(async (options) => {
				try {
					// If only setting as active, do that and return
					if (
						options.active &&
						!options.json &&
						!options.file &&
						!options.provider &&
						!options.baseUrl &&
						!options.autoApproval &&
						!options.allowRead &&
						!options.allowWrite &&
						!options.allowExecute &&
						!options.allowBrowser &&
						!options.allowMcp &&
						!options.allowModeSwitch &&
						!options.allowSubtasks &&
						!options.secure
					) {
						await wsClient.sendCommand("setActiveProfile", options.name)
						console.log(chalk.green(`\nProfile Activated: Profile "${options.name}" is now active`))
						return
					}

					// Get the current configuration first
					const currentConfig = await wsClient.sendCommand("getConfiguration")

					// Start with the current configuration
					let config: any = { ...currentConfig }
					let hasConfigChanges = false
					let hasPermissionChanges = false

					// Update configuration if provided
					if (options.json) {
						try {
							const jsonConfig = JSON.parse(options.json)
							config = { ...config, ...jsonConfig }
							hasConfigChanges = true
						} catch (error) {
							throw new Error("Invalid JSON format")
						}
					} else if (options.file) {
						// Implementation for reading from file would go here
						throw new Error("File reading not implemented yet")
					} else if (options.provider && options.apikey) {
						// Create a configuration based on the provider
						switch (options.provider.toLowerCase()) {
							case "openrouter": {
								const modelId = options.model || "anthropic/claude-3.7-sonnet"
								const providerConfig = {
									apiProvider: "openrouter",
									openRouterApiKey: options.apikey,
									openRouterModelId: modelId,
									openRouterBaseUrl: "https://openrouter.ai/api/v1",
									openRouterUseMiddleOutTransform: true,
									// Default model info for Claude 3.7 Sonnet
									openRouterModelInfo: {
										maxTokens: 8192,
										contextWindow: 200000,
										supportsImages: true,
										supportsComputerUse: true,
										supportsPromptCache: true,
										inputPrice: 3.0,
										outputPrice: 15.0,
										cacheWritesPrice: 3.75,
										cacheReadsPrice: 0.3,
									},
								}
								config = { ...config, ...providerConfig }
								hasConfigChanges = true
								break
							}
							case "anthropic": {
								const modelId = options.model || "claude-3.7-sonnet"
								const baseUrl = options.baseUrl
								const providerConfig = {
									apiProvider: "anthropic",
									apiKey: options.apikey,
									apiModelId: modelId,
									...(baseUrl && { anthropicBaseUrl: baseUrl }),
								}
								config = { ...config, ...providerConfig }
								hasConfigChanges = true
								break
							}
							case "openai-compat": {
								const modelId = options.model || "gpt-4o"
								const baseUrl = options.baseUrl || "https://api.openai.com/v1"
								const providerConfig = {
									apiProvider: "openai",
									openAiApiKey: options.apikey,
									openAiModelId: modelId,
									openAiBaseUrl: baseUrl,
								}
								config = { ...config, ...providerConfig }
								hasConfigChanges = true
								break
							}
							case "openai": {
								const modelId = options.model || "gpt-4o"
								const providerConfig = {
									apiProvider: "openai-native",
									openAiNativeApiKey: options.apikey,
									openAiModelId: modelId,
								}
								config = { ...config, ...providerConfig }
								hasConfigChanges = true
								break
							}
							case "deepseek": {
								const modelId = options.model || "deepseek-coder"
								const baseUrl = options.baseUrl
								const providerConfig = {
									apiProvider: "deepseek",
									deepSeekApiKey: options.apikey,
									...(baseUrl && { deepSeekBaseUrl: baseUrl }),
								}
								config = { ...config, ...providerConfig }
								hasConfigChanges = true
								break
							}
							case "gemini": {
								const modelId = options.model || "gemini-1.5-pro"
								const baseUrl = options.baseUrl
								const providerConfig = {
									apiProvider: "gemini",
									geminiApiKey: options.apikey,
									...(baseUrl && { googleGeminiBaseUrl: baseUrl }),
								}
								config = { ...config, ...providerConfig }
								hasConfigChanges = true
								break
							}
							case "glama": {
								const modelId = options.model || "glama-1.5"
								const providerConfig = {
									apiProvider: "glama",
									glamaApiKey: options.apikey,
									glamaModelId: modelId,
								}
								config = { ...config, ...providerConfig }
								hasConfigChanges = true
								break
							}
							case "mistral": {
								const modelId = options.model || "mistral-large-latest"
								const baseUrl = options.baseUrl
								const providerConfig = {
									apiProvider: "mistral",
									mistralApiKey: options.apikey,
									...(baseUrl && { mistralCodestralUrl: baseUrl }),
								}
								config = { ...config, ...providerConfig }
								hasConfigChanges = true
								break
							}
							case "lmstudio": {
								const modelId = options.model || "default"
								const baseUrl = options.baseUrl
								const providerConfig = {
									apiProvider: "lmstudio",
									lmStudioModelId: modelId,
									...(baseUrl && { lmStudioBaseUrl: baseUrl }),
								}
								config = { ...config, ...providerConfig }
								hasConfigChanges = true
								break
							}
							case "unbound": {
								const modelId = options.model || "unbound-default"
								const providerConfig = {
									apiProvider: "unbound",
									unboundApiKey: options.apikey,
									unboundModelId: modelId,
								}
								config = { ...config, ...providerConfig }
								hasConfigChanges = true
								break
							}
							case "vscode-lm": {
								const modelId = options.model || "default"
								const providerConfig = {
									apiProvider: "vscode-lm",
									vsCodeLmModelSelector: {
										id: modelId,
									},
								}
								config = { ...config, ...providerConfig }
								hasConfigChanges = true
								break
							}
							default:
								throw new Error(
									`Provider '${options.provider}' is not supported yet for simplified configuration`,
								)
						}
					}

					// Parse boolean options
					const parseBool = (value: string): boolean => {
						if (value === "true" || value === "yes" || value === "1") return true
						if (value === "false" || value === "no" || value === "0") return false
						return true // Default to true for permissions
					}

					// Update permissions if specified
					if (options.secure) {
						// Secure mode: disable all auto-approvals
						config.autoApprovalEnabled = false
						config.alwaysAllowReadOnly = false
						config.alwaysAllowWrite = false
						config.alwaysAllowExecute = false
						config.alwaysAllowBrowser = false
						config.alwaysAllowMcp = false
						config.alwaysAllowModeSwitch = false
						config.alwaysAllowSubtasks = false
						config.allowedCommands = [] // No commands allowed in secure mode
						hasPermissionChanges = true
					} else {
						// Set auto-approval if specified
						if (options.autoApproval !== undefined) {
							config.autoApprovalEnabled = parseBool(options.autoApproval)
							hasPermissionChanges = true
						}

						// Set individual permissions if specified
						if (options.allowRead !== undefined) {
							config.alwaysAllowReadOnly = parseBool(options.allowRead)
							hasPermissionChanges = true
						}

						if (options.allowWrite !== undefined) {
							config.alwaysAllowWrite = parseBool(options.allowWrite)
							hasPermissionChanges = true
						}

						if (options.allowExecute !== undefined) {
							config.alwaysAllowExecute = parseBool(options.allowExecute)
							hasPermissionChanges = true
						}

						// Set allowed commands if specified
						if (options.allowedCommands !== undefined) {
							if (options.allowedCommands === "*") {
								// Special case: wildcard (all commands allowed)
								config.allowedCommands = ["*"]
							} else {
								// Parse the comma-separated list of commands
								const commands = options.allowedCommands.split(",").map((cmd: string) => cmd.trim())
								config.allowedCommands = commands
							}
							hasPermissionChanges = true
						}

						if (options.allowBrowser !== undefined) {
							config.alwaysAllowBrowser = parseBool(options.allowBrowser)
							hasPermissionChanges = true
						}

						if (options.allowMcp !== undefined) {
							config.alwaysAllowMcp = parseBool(options.allowMcp)
							hasPermissionChanges = true
						}

						if (options.allowModeSwitch !== undefined) {
							config.alwaysAllowModeSwitch = parseBool(options.allowModeSwitch)
							hasPermissionChanges = true
						}

						if (options.allowSubtasks !== undefined) {
							config.alwaysAllowSubtasks = parseBool(options.allowSubtasks)
							hasPermissionChanges = true
						}
					}

					// Ensure the name is set
					config.name = options.name

					// Only update if there are changes
					if (hasConfigChanges || hasPermissionChanges) {
						// Update the configuration
						await wsClient.sendCommand("updateConfiguration", { name: options.name, config })

						if (hasConfigChanges && hasPermissionChanges) {
							console.log(
								chalk.green(
									`\nProfile Updated: Profile "${options.name}" has been updated with new configuration and permissions`,
								),
							)
						} else if (hasConfigChanges) {
							console.log(
								chalk.green(
									`\nProfile Updated: Profile "${options.name}" has been updated with new configuration`,
								),
							)
						} else {
							console.log(
								chalk.green(
									`\nProfile Updated: Profile "${options.name}" has been updated with new permissions`,
								),
							)
						}
					} else if (!options.active) {
						console.log(chalk.blue(`\nNo Changes: No changes were made to profile "${options.name}"`))
					}

					// Set the profile as active if requested
					if (options.active) {
						await wsClient.sendCommand("setActiveProfile", options.name)
						console.log(chalk.green(`\nProfile Activated: Profile "${options.name}" is now active`))
					}
				} catch (error) {
					console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
					process.exit(1)
				}
				// Exit immediately after profile command
				process.exit(0)
			})
	)
}

/**
 * Create the delete profile command
 * @param wsClient The WebSocket client
 * @returns The delete profile command
 */
export function deleteProfileCommand(wsClient: WebSocketClient): Command {
	return new Command("profile")
		.description("Delete a profile")
		.requiredOption("--name <name>", "Profile name")
		.option("-f, --force", "Force deletion without confirmation")
		.action(async (options) => {
			try {
				if (!options.name) {
					throw new Error("Profile name is required")
				}

				let shouldDelete = options.force

				if (!shouldDelete) {
					shouldDelete = await displayConfirmation(
						`Are you sure you want to delete profile "${options.name}"?`,
					)
				}

				if (shouldDelete) {
					await wsClient.sendCommand("deleteProfile", { name: options.name })
					console.log(chalk.green(`\nProfile Deleted: Profile "${options.name}" has been deleted`))
				} else {
					console.log(chalk.yellow("Profile deletion cancelled"))
				}
			} catch (error) {
				console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
				process.exit(1)
			}
			// Exit immediately after profile command
			process.exit(0)
		})
}
