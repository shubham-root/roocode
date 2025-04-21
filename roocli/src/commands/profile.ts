import chalk from "chalk"
import { Command } from "commander"
import { displayBox, displayConfirmation } from "../utils/display"
import { WebSocketClient } from "../utils/websocket-client"

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
						displayBox("Active Profile", "No active profile", "info")
						return
					}

					// Get the configuration for more details if verbose
					if (options.verbose) {
						const config = await wsClient.sendCommand("getConfiguration")
						displayBox("Active Profile", JSON.stringify(config, null, 2), "info")
					} else {
						displayBox("Active Profile", activeProfile, "info")
					}
				} else {
					const profiles = await wsClient.sendCommand("getProfiles")

					if (options.verbose) {
						// Get the full configuration for more details
						const config = await wsClient.sendCommand("getConfiguration")
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
							displayBox("Profiles", JSON.stringify(formattedProfiles, null, 2), "info")
						} else {
							displayBox("Profiles", profiles.join("\n"), "info")
						}
					} else {
						displayBox("Profiles", profiles.join("\n"), "info")
					}
				}
			} catch (error) {
				console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
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
					}

					// Set the configuration
					await wsClient.sendCommand("setConfiguration", config)

					// Create the profile
					const profileId = await wsClient.sendCommand("createProfile", options.name)
					displayBox("Profile Created", `Profile "${options.name}" created with ID: ${profileId}`, "success")

					// Set the profile as active if requested
					if (options.active) {
						await wsClient.sendCommand("setActiveProfile", options.name)
						displayBox("Profile Activated", `Profile "${options.name}" is now active`, "success")
					}
				} catch (error) {
					console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
				}
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
			// Permission options
			.option("--auto-approval <boolean>", "Enable or disable auto-approval for all tools")
			.option("--allow-read <boolean>", "Auto-approve read-only operations")
			.option("--allow-write <boolean>", "Auto-approve write operations")
			.option("--allow-execute <boolean>", "Auto-approve execute operations")
			.option("--allow-browser <boolean>", "Auto-approve browser operations")
			.option("--allow-mcp <boolean>", "Auto-approve MCP operations")
			.option("--allow-mode-switch <boolean>", "Auto-approve mode switch operations")
			.option("--allow-subtasks <boolean>", "Auto-approve subtask operations")
			.option("--secure", "Disable all auto-approvals (secure mode)")
			.action(async (options) => {
				try {
					// If only setting as active, do that and return
					if (
						options.active &&
						!options.json &&
						!options.file &&
						!options.provider &&
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
						displayBox("Profile Activated", `Profile "${options.name}" is now active`, "success")
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
							displayBox(
								"Profile Updated",
								`Profile "${options.name}" has been updated with new configuration and permissions`,
								"success",
							)
						} else if (hasConfigChanges) {
							displayBox(
								"Profile Updated",
								`Profile "${options.name}" has been updated with new configuration`,
								"success",
							)
						} else {
							displayBox(
								"Profile Updated",
								`Profile "${options.name}" has been updated with new permissions`,
								"success",
							)
						}
					} else if (!options.active) {
						displayBox("No Changes", `No changes were made to profile "${options.name}"`, "info")
					}

					// Set the profile as active if requested
					if (options.active) {
						await wsClient.sendCommand("setActiveProfile", options.name)
						displayBox("Profile Activated", `Profile "${options.name}" is now active`, "success")
					}
				} catch (error) {
					console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
				}
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
					displayBox("Profile Deleted", `Profile "${options.name}" has been deleted`, "success")
				} else {
					console.log(chalk.yellow("Profile deletion cancelled"))
				}
			} catch (error) {
				console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
			}
		})
}
