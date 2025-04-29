import chalk from "chalk"
import { displayCollapsibleBox } from "../utils/display"
import { storeFollowupQuestion } from "../utils/followup-store"
import { parseFollowupQuestion } from "../utils/message-helpers"
import { getToolPermissionSettings } from "../utils/settings-storage"
import { ToolCategory, getToolCategory } from "../utils/tool-categories"
import { EventName, WebSocketClient } from "../utils/websocket-client"

/**
 * Utility functions for task operations
 * These functions are used by the create and update commands
 */

/**
 * Wait for a specified amount of time
 * @param ms Time to wait in milliseconds
 */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Set up event listeners for a task
 * @export
 * @param wsClient The WebSocket client
 * @param taskId The ID of the task to listen for
 */
export async function setupTaskEventListeners(wsClient: WebSocketClient, taskId: string): Promise<void> {
	// First, clean up any existing event listeners to prevent duplicates
	wsClient.removeTaskEventListeners()

	// Create a set to track processed message contents to prevent duplicates
	const processedContents = new Set<string>()

	// Track the last displayed message to prevent immediate duplicates
	let lastDisplayedMessage = ""

	// Flag to track if we need to add a newline before the next message
	let needsNewline = false

	// Subscribe to all events for this task to keep the connection alive
	await wsClient.subscribeToTaskEvents(taskId)

	// Handle partial message updates
	wsClient.on("partialMessage", (data) => {
		if (data.taskId === taskId) {
			// Write the delta (new part) to stdout without a newline
			process.stdout.write(data.delta || "")
		}
	})
	// Handle complete messages
	wsClient.on("completeMessage", (data) => {
		if (data.taskId === taskId) {
			// Skip if this is exactly the same as the last displayed message
			if (data.content === lastDisplayedMessage) {
				return
			}

			// Skip if we've already processed this content
			if (processedContents.has(data.content)) {
				return
			}

			// We'll use the original content for processing
			const contentToProcess = data.content

			// Mark this content as processed
			processedContents.add(data.content)
			lastDisplayedMessage = data.content

			// Add a newline if needed
			if (needsNewline) {
				console.log("")
				needsNewline = false
			}

			// Check if this is a followup question with suggestions
			const followupQuestion = parseFollowupQuestion(contentToProcess)

			if (followupQuestion) {
				// Store the followup question for later use with --interact-suggestions
				storeFollowupQuestion({
					...followupQuestion,
					taskId: data.taskId,
				})

				// Set the flag to add a newline before the next message
				needsNewline = true

				// Format and display the followup question
				console.log(chalk.blue("\nQuestion:"), followupQuestion.question)
				console.log(chalk.blue("\nSuggested answers:"))

				followupQuestion.suggest.forEach((suggestion: string, index: number) => {
					console.log(`${chalk.green(index + 1 + ".")} ${suggestion}`)
				})

				console.log(chalk.yellow("\nUse 'roocli update task --interact-suggestions' to select an answer"))
				console.log(
					chalk.yellow(
						"Or use 'roocli update task --message \"your response\"' to provide a custom response",
					),
				)
			} else {
				// Check if the content is JSON and filter out unwanted JSON output
				try {
					const jsonContent = JSON.parse(contentToProcess)

					// If it contains a "request" field, it's likely the unwanted JSON output
					if (jsonContent.request) {
						// Skip printing this JSON
						return
					}

					// If it contains a "Result" field, it's likely the unwanted JSON output
					if (typeof jsonContent === "object" && "Result" in jsonContent) {
						// Skip printing this JSON
						return
					}

					// Check if this might be a checkpoint hash
					if (
						typeof jsonContent === "string" &&
						jsonContent.length === 40 &&
						/^[0-9a-f]+$/.test(jsonContent)
					) {
						// This looks like a checkpoint hash
						displayCollapsibleBox("Checkpoint Saved", `Checkpoint hash: ${jsonContent}`, "success")
						return
					}

					// Check if the content contains a checkpoint hash
					const content = contentToProcess.trim()
					const hashMatch = content.match(/([0-9a-f]{40})/)
					if (hashMatch) {
						displayCollapsibleBox("Checkpoint Saved", `Checkpoint hash: ${hashMatch[1]}`, "success")
						return
					}

					// Check if this is a tool-related JSON
					if (typeof jsonContent === "object" && jsonContent.tool) {
						// Skip printing this JSON - it will be handled by the message event handler
						return
					}

					// Otherwise, print the JSON content with proper spacing
					console.log(contentToProcess)
					needsNewline = true
				} catch (e) {
					// Not JSON, check if it's a checkpoint hash in plain text
					const content = contentToProcess.trim()

					// Check if the content contains a checkpoint hash
					const hashMatch = content.match(/([0-9a-f]{40})/)
					if (hashMatch) {
						// Add a newline before checkpoint messages
						console.log("")
						displayCollapsibleBox("Checkpoint Saved", `Checkpoint hash: ${hashMatch[1]}`, "success")
						needsNewline = true
						return
					}
					if (content.length === 40 && /^[0-9a-f]+$/.test(content)) {
						// This looks like a checkpoint hash
						// Add a newline before checkpoint messages
						console.log("")
						displayCollapsibleBox("Checkpoint Saved", `Checkpoint hash: ${content}`, "success")
						needsNewline = true
						return
					}

					// Not a checkpoint hash, just print the filtered content
					if (contentToProcess.trim()) {
						console.log(contentToProcess)
						needsNewline = true
					}
				}
			}
		}
	})

	// We no longer need the original message handler as it causes duplicate output
	// The partialMessage and completeMessage handlers above handle all message types

	// Set up handlers for all events in the EventName enum
	// This ensures the CLI handles the same events as the webview-UI

	// Handle task completion events
	wsClient.on(EventName.TaskCompleted, (payload) => {
		if (payload && payload[0] && payload[0] === taskId) {
			console.log(chalk.green("\nTask completed."))
			// Clean up event listeners when the task is completed
			wsClient.removeTaskEventListeners()
			// Signal that the task is complete
			wsClient.emit("taskFinished", taskId)
		}
	})

	// Handle task aborted events
	wsClient.on(EventName.TaskAborted, (payload) => {
		if (payload && payload[0] && payload[0] === taskId) {
			console.log(chalk.yellow("\nTask aborted."))
			// Clean up event listeners when the task is aborted
			wsClient.removeTaskEventListeners()
			// Signal that the task is complete
			wsClient.emit("taskFinished", taskId)
		}
	})

	// Handle ask response events (when user interaction is required)
	wsClient.on(EventName.TaskAskResponded, (payload) => {
		if (payload && payload[0] && payload[0] === taskId) {
			console.log(chalk.blue("\nTask is waiting for your response."))
			// Clean up event listeners when the task requires user interaction
			// wsClient.removeTaskEventListeners()
			// Signal that the task is complete
			// wsClient.emit("taskFinished", taskId)
		}
	})

	// Handle task started events
	wsClient.on(EventName.TaskStarted, (payload) => {
		if (payload && payload[0] && payload[0] === taskId) {
			if (wsClient.isDebugMode()) {
				console.log(chalk.blue(`Task ${taskId} started.`))
			}
		}
	})

	// Handle task mode switched events
	wsClient.on(EventName.TaskModeSwitched, (payload) => {
		if (payload && payload.length >= 2 && payload[0] === taskId) {
			if (wsClient.isDebugMode()) {
				console.log(chalk.blue(`Task switched to mode: ${payload[1]}`))
			}
		}
	})

	// Handle task paused events
	wsClient.on(EventName.TaskPaused, (payload) => {
		if (payload && payload[0] && payload[0] === taskId) {
			if (wsClient.isDebugMode()) {
				console.log(chalk.yellow(`Task ${taskId} paused.`))
			}
		}
	})

	// Handle task unpaused events
	wsClient.on(EventName.TaskUnpaused, (payload) => {
		if (payload && payload[0] && payload[0] === taskId) {
			if (wsClient.isDebugMode()) {
				console.log(chalk.green(`Task ${taskId} resumed.`))
			}
		}
	})

	// Handle task spawned events
	wsClient.on(EventName.TaskSpawned, (payload) => {
		if (payload && payload.length >= 2 && payload[0] === taskId) {
			if (wsClient.isDebugMode()) {
				console.log(chalk.blue(`Task spawned child task: ${payload[1]}`))
			}
		}
	})

	// Handle token usage updated events
	// wsClient.on(EventName.TaskTokenUsageUpdated, (payload) => {
	// 	if (payload && payload.length >= 2 && payload[0] === taskId) {
	// 		console.log(chalk.blue(`Token usage updated: ${JSON.stringify(payload[1])}`))
	// 	}
	// })

	// Keep track of the last tool message of each type
	const lastToolMessages = new Map<
		string,
		{ title: string; content: string; style: "info" | "success" | "warning" | "error" }
	>()

	// Handle message events for checkpoint_saved and tools
	wsClient.on("message", (eventData) => {
		if (wsClient.isDebugMode()) {
			console.log("DEBUG: Received message event:", JSON.stringify(eventData).substring(0, 200) + "...")
		}
		if (Array.isArray(eventData) && eventData.length > 0) {
			for (const data of eventData) {
				if (data && data.taskId === taskId && data.message) {
					const { message } = data
					if (wsClient.isDebugMode()) {
						console.log(
							"DEBUG: Processing message:",
							JSON.stringify({
								type: message.type,
								say: message.say,
								ask: message.ask,
								hasText: !!message.text,
								textLength: message.text ? message.text.length : 0,
							}),
						)
					}

					// Skip user_feedback and user_feedback_diff messages
					if (
						message.type === "say" &&
						(message.say === "user_feedback" || message.say === "user_feedback_diff")
					) {
						continue
					}

					// Skip if we've already processed this content
					if (message.text && processedContents.has(message.text)) {
						continue
					}

					// Mark this content as processed if it has text
					if (message.text) {
						processedContents.add(message.text)
					}

					// Add a newline before checkpoint messages
					if (message.type === "say" && message.say === "checkpoint_saved") {
						console.log("")
						needsNewline = false
					}

					// Handle tool messages
					if (wsClient.isDebugMode()) {
						console.log("DEBUG: Checking if tool message:", message.type === "say", message.say === "tool")
					}
					if (message.type === "say" && message.say === "tool") {
						if (wsClient.isDebugMode()) {
							console.log("DEBUG: Found tool message")
						}
						if (message.text) {
							if (wsClient.isDebugMode()) {
								console.log("DEBUG: Tool message has text")
							}
							try {
								// Parse the message text to get the tool details
								const jsonContent = JSON.parse(message.text)
								// Get the tool type from the ClineSayTool structure
								const toolType = jsonContent.tool || "Unknown"

								// Create a descriptive title with tool name and path if available
								let title = `Tool Output: ${toolType}`
								if (jsonContent.path) {
									title += ` | ${jsonContent.path}`
								}

								// All tool types from ClineSayTool interface:
								// "editedExistingFile" | "appliedDiff" | "newFileCreated" | "readFile" |
								// "fetchInstructions" | "listFilesTopLevel" | "listFilesRecursive" |
								// "listCodeDefinitionNames" | "searchFiles" | "switchMode" | "newTask" | "finishTask"
								// Display in a collapsible box with appropriate styling based on tool type
								let boxStyle: "info" | "success" | "warning" | "error" = "info"

								// Use different styles for different tool types
								if (["editedExistingFile", "appliedDiff", "newFileCreated"].includes(toolType)) {
									boxStyle = "success" // Green for file modifications
								} else if (
									[
										"readFile",
										"listFilesTopLevel",
										"listFilesRecursive",
										"listCodeDefinitionNames",
										"searchFiles",
									].includes(toolType)
								) {
									boxStyle = "info" // Blue for read operations
								} else if (["switchMode", "newTask", "finishTask"].includes(toolType)) {
									boxStyle = "warning" // Yellow for mode/task operations
								}

								// Store this tool message as the last one of its type
								lastToolMessages.set(toolType, {
									title,
									content: message.text,
									style: boxStyle,
								})

								// Don't display the tool message yet - we'll display the last one of each type at the end
								continue
							} catch (e) {
								if (wsClient.isDebugMode()) {
									console.log("DEBUG: Error parsing tool message JSON:", e)
								}
								// Not valid JSON, continue with normal processing
							}
						} else {
							if (wsClient.isDebugMode()) {
								console.log("DEBUG: Tool message has no text")
							}
						}
					}
					// Handle tool ask messages (tool approval requests)
					if (wsClient.isDebugMode()) {
						console.log(
							"DEBUG: Checking if tool ask message:",
							message.type === "ask",
							message.ask === "tool",
						)
					}
					if (message.type === "ask" && message.ask === "tool") {
						if (wsClient.isDebugMode()) {
							console.log("DEBUG: Found tool ask message")
						}
						if (message.text) {
							if (wsClient.isDebugMode()) {
								console.log("DEBUG: Tool ask message has text")
							}
							try {
								// Parse the message text to get the tool details
								if (wsClient.isDebugMode()) {
									console.log("DEBUG: Attempting to parse tool ask message JSON")
								}
								const jsonContent = JSON.parse(message.text)
								if (wsClient.isDebugMode()) {
									console.log("DEBUG: Parsed JSON content:", JSON.stringify(jsonContent))
								}

								// Check if the jsonContent is consistent with ClineSayTool interface
								if (wsClient.isDebugMode()) {
									console.log(
										"DEBUG: Checking if JSON content has tool property:",
										jsonContent && typeof jsonContent === "object",
										jsonContent ? "tool" in jsonContent : false,
									)
								}
								if (jsonContent && typeof jsonContent === "object" && "tool" in jsonContent) {
									if (wsClient.isDebugMode()) {
										console.log("DEBUG: JSON content has tool property")
									}
									// Get the tool type from the ClineSayTool structure
									let toolName = jsonContent.tool || "Unknown"
									let toolPath = jsonContent.path || ""

									// Check if this tool should be auto-approved based on user settings
									if (wsClient.isDebugMode()) {
										console.log(
											"DEBUG: Checking if tool should be auto-approved:",
											toolName,
											toolPath,
										)
									}
									const shouldAutoApprove = shouldAutoApproveTool(toolName, toolPath)
									if (wsClient.isDebugMode()) {
										console.log("DEBUG: Should auto-approve:", shouldAutoApprove)
									}
									if (shouldAutoApprove) {
										if (wsClient.isDebugMode()) {
											console.log("DEBUG: Auto-approving tool")
										}
										// Auto-approve the tool by sending a "yesButtonClicked" response
										wsClient.sendCommand("askResponse", {
											askResponse: "yesButtonClicked",
										})

										// Display auto-approval message
										displayCollapsibleBox(
											`Tool Auto-Approved: ${toolName}`,
											`The tool ${toolName}${toolPath ? ` | ${toolPath}` : ""} was automatically approved based on your permission settings.`,
											"info",
										)

										needsNewline = true
										continue
									}

									// Create a followup question format for tool approval
									const question = `Do you want to approve the tool use: ${toolName}${toolPath ? ` | ${toolPath}` : ""}?`
									if (wsClient.isDebugMode()) {
										console.log("DEBUG: Created tool approval question:", question)
									}

									// Format and display tool approval request
									if (wsClient.isDebugMode()) {
										console.log("DEBUG: Displaying tool approval request")
									}
									console.log(chalk.blue("\nTool Approval Request:"), question)
									console.log(chalk.blue("\nOptions:"))

									// Check if it's a file operation tool to use "Save" instead of "Approve"
									const isFileOperation = [
										"editedExistingFile",
										"appliedDiff",
										"newFileCreated",
									].includes(toolName)
									const primaryButtonText = isFileOperation ? "Save" : "Approve"

									console.log(`${chalk.green("1.")} ${primaryButtonText}`)
									console.log(`${chalk.red("2.")} Reject`)

									console.log(
										chalk.yellow(
											`\nUse 'roocli update task --interact primary' to ${primaryButtonText.toLowerCase()}`,
										),
									)
									console.log(chalk.yellow("Use 'roocli update task --interact secondary' to reject"))
									console.log(
										chalk.yellow(
											`Or use 'roocli update task --message "${primaryButtonText.toLowerCase()}"' or 'roocli update task --message "reject"' to respond`,
										),
									)

									needsNewline = true
									continue
								} else {
									if (wsClient.isDebugMode()) {
										console.log("DEBUG: JSON content does not have expected structure")
									}
								}
							} catch (e) {
								if (wsClient.isDebugMode()) {
									console.log("DEBUG: Error parsing tool ask message JSON:", e)
								}
								// Not valid JSON, continue with normal processing
							}
						} else {
							if (wsClient.isDebugMode()) {
								console.log("DEBUG: Tool ask message has no text")
							}
						}
					}

					// Check if this is a checkpoint_saved message
					if (message.type === "say" && message.say === "checkpoint_saved" && message.text) {
						// Set the flag to add a newline before the next message
						needsNewline = true
						try {
							// Try to parse the checkpoint hash from the message text
							const checkpointData = JSON.parse(message.text)
							if (checkpointData && typeof checkpointData === "object") {
								// Display the checkpoint hash in a collapsible box
								const hash = checkpointData.hash || "Unknown"
								displayCollapsibleBox("Checkpoint Saved", `Checkpoint hash: ${hash}`, "success")
							}
						} catch (e) {
							// If parsing fails, just display the raw text
							displayCollapsibleBox("Checkpoint Saved", message.text, "success")
						}
					}
				}
			}

			// After processing all messages, display the last tool message of each type
			if (lastToolMessages.size > 0) {
				// Add a newline before tool messages if needed
				if (needsNewline) {
					console.log("")
					needsNewline = false
				}

				// Display each tool message
				for (const [toolType, { title, content, style }] of lastToolMessages.entries()) {
					displayCollapsibleBox(title, content, style)
					needsNewline = true
				}

				// Clear the tool messages map after displaying them
				lastToolMessages.clear()
			}
		}
	})
}

/**
 * Wait for a task to complete or timeout
 * @export
 * @param wsClient The WebSocket client
 * @param taskId The ID of the task to wait for
 * @param timeoutMs Timeout in milliseconds
 * @returns A promise that resolves when the task is complete or times out
 */
export async function waitForTaskCompletion(
	wsClient: WebSocketClient,
	taskId: string,
	timeoutMs: number = 20000,
): Promise<void> {
	return new Promise<void>((resolve) => {
		// Reset the last activity time
		wsClient.resetLastActivityTime()

		let timeoutId: NodeJS.Timeout
		let activityCheckId: NodeJS.Timeout
		let shouldAutoExit = false

		// Set up a listener for the taskFinished event
		const finishListener = (id: string) => {
			if (id === taskId) {
				clearTimeout(timeoutId)
				clearInterval(activityCheckId)
				wsClient.removeListener("taskFinished", finishListener)
				resolve()
			}
		}

		// Listen for the taskFinished event
		wsClient.on("taskFinished", finishListener)

		// Check if the last message is an ask or attempt_completion type
		const checkLastMessageType = async () => {
			try {
				// Get the last message from the client's state instead of making a websocket call
				let lastMessage = wsClient.getLastMessage(taskId)

				// If no message is found in the client's state, fall back to the websocket call
				if (!lastMessage) {
					lastMessage = await wsClient.sendCommand("lastMessage", { taskId })
				}

				// Get the current profile settings for auto-approval
				const profileSettings = await wsClient.sendCommand("getConfiguration")
				const autoApprovalEnabled = profileSettings?.autoApprovalEnabled === true
				const alwaysAllowExecute = profileSettings?.alwaysAllowExecute === true
				const alwaysAllowBrowser = profileSettings?.alwaysAllowBrowser === true
				const alwaysAllowMcp = profileSettings?.alwaysAllowMcp === true

				// Check if the last message is an ask type or attempt_completion
				if (lastMessage && lastMessage.type === "ask") {
					// List of all ask types that should trigger auto-exit
					// These correspond to cases where setEnableButtons(true) is called in the webview
					const autoExitAskTypes = [
						"followup",
						"completion_result",
						"api_req_failed",
						"mistake_limit_reached",
						"tool",
						"browser_action_launch",
						"command",
						"command_output",
						"use_mcp_server",
						"resume_task",
						"resume_completed_task",
					]

					// Check if we should auto-approve based on profile settings
					if (
						lastMessage.ask === "command_output" ||
						lastMessage.ask === "api_req_failed" ||
						(lastMessage.ask === "tool" && autoApprovalEnabled) ||
						(lastMessage.ask === "resume_task" && autoApprovalEnabled) ||
						(lastMessage.ask === "command" && alwaysAllowExecute) ||
						(lastMessage.ask === "browser_action_launch" && alwaysAllowBrowser) ||
						(lastMessage.ask === "use_mcp_server" && alwaysAllowMcp)
					) {
						// Auto-approve by sending a "yesButtonClicked" response
						await wsClient.sendCommand("askResponse", {
							askResponse: "yesButtonClicked",
						})

						console.log(
							chalk.green(`\nAuto-approved ${lastMessage.ask} based on your permission settings.`),
						)

						// Wait a moment for the response to be processed
						await wait(500)

						// Check if there's a new message by getting the latest state
						const updatedMessage = wsClient.getLastMessage(taskId)
						// If no message is found in the client's state, fall back to the websocket call
						if (!updatedMessage) {
							await wsClient.sendCommand("lastMessage", { taskId })
						}
						// We don't need to do anything with the result, just checking if there's activity
					}

					if (autoExitAskTypes.includes(lastMessage.ask)) {
						shouldAutoExit = true
						clearTimeout(timeoutId)
						clearInterval(activityCheckId)
						wsClient.removeListener("taskFinished", finishListener)
						wsClient.removeTaskEventListeners()

						// Display a specific message based on the ask type
						switch (lastMessage.ask) {
							case "followup":
								console.log(chalk.green("\nQuestion received. Exiting automatically."))
								break
							case "completion_result":
								console.log(
									chalk.green("\nTask completed. Use 'roocli create task' to start a new task."),
								)
								break
							case "api_req_failed":
								console.log(
									chalk.green(
										"\nAPI request failed. Use 'roocli update task --interact primary' to retry or 'roocli create task' to start a new task.",
									),
								)
								break
							case "mistake_limit_reached":
								console.log(
									chalk.green(
										"\nMistake limit reached. Use 'roocli update task --interact primary' to proceed anyway or 'roocli create task' to start a new task.",
									),
								)
								break
							case "tool":
								console.log(
									chalk.green(
										"\nTool approval required. Use 'roocli update task --interact primary' to approve or 'roocli update task --interact secondary' to reject.",
									),
								)
								break
							case "browser_action_launch":
								console.log(
									chalk.green(
										"\nBrowser action approval required. Use 'roocli update task --interact primary' to approve or 'roocli update task --interact secondary' to reject.",
									),
								)
								break
							case "command":
								console.log(
									chalk.green(
										"\nCommand approval required. Use 'roocli update task --interact primary' to run command or 'roocli update task --interact secondary' to reject.",
									),
								)
								break
							case "command_output":
								console.log(
									chalk.green(
										"\nCommand output received. Use 'roocli update task --interact primary' to proceed while running.",
									),
								)
								break
							case "use_mcp_server":
								console.log(
									chalk.green(
										"\nMCP server approval required. Use 'roocli update task --interact primary' to approve or 'roocli update task --interact secondary' to reject.",
									),
								)
								break
							case "resume_task":
								console.log(
									chalk.green(
										"\nTask paused. Use 'roocli update task --interact primary' to resume task or 'roocli update task --interact secondary' to terminate.",
									),
								)
								break
							case "resume_completed_task":
								console.log(
									chalk.green("\nTask completed. Use 'roocli create task' to start a new task."),
								)
								break
							default:
								console.log(chalk.green("\nTask completed. Exiting automatically."))
						}

						resolve()
						// Exit the process when auto-exit is triggered
						process.exit(0)
						return true
					}
				}
				// if (Array.isArray(messages) && messages.length > 0) {
				// 	const lastMessage = messages[messages.length - 1]

				// }
				return false
			} catch (error) {
				console.error(
					chalk.red(
						`Error checking last message type: ${error instanceof Error ? error.message : String(error)}`,
					),
				)
				return false
			}
		}

		// Set up an interval to check for activity
		activityCheckId = setInterval(async () => {
			// If there's been activity in the last 5 seconds, reset the timeout
			if (wsClient.getTimeSinceLastActivity() < 5000) {
				// Activity detected, check if we should auto-exit based on the last message
				const didAutoExit = await checkLastMessageType()
				if (didAutoExit) return

				// Reset the timeout
				clearTimeout(timeoutId)

				// Set up a new timeout
				timeoutId = setTimeout(() => {
					clearInterval(activityCheckId)
					wsClient.removeListener("taskFinished", finishListener)
					console.log(chalk.yellow("\nTask is still running. Press Ctrl+C to exit."))
					resolve()
				}, timeoutMs)
			}
		}, 1000)

		// Set up the initial timeout
		timeoutId = setTimeout(async () => {
			// Check if we should auto-exit based on the last message
			const didAutoExit = await checkLastMessageType()
			if (didAutoExit) return

			clearInterval(activityCheckId)
			wsClient.removeListener("taskFinished", finishListener)

			// Check if there's been any activity
			if (wsClient.getTimeSinceLastActivity() < timeoutMs) {
				// If there's been activity, keep waiting
				console.log(chalk.yellow("\nTask is still running. Press Ctrl+C to exit."))
			} else {
				// If we haven't received any events, assume the task is not going to respond
				console.log(chalk.red("\nNo response received from task within timeout period."))
				wsClient.removeTaskEventListeners()
			}

			resolve()
		}, timeoutMs)
	})
}
// No taskCommand function - this functionality has been moved to create.ts and update.ts

/**
 * Check if a tool should be auto-approved based on user settings
 * @param toolName The name of the tool
 * @param toolPath The path associated with the tool (if any)
 * @returns True if the tool should be auto-approved, false otherwise
 */
function shouldAutoApproveTool(toolName: string, toolPath: string): boolean {
	// Get the current tool permission settings
	const settings = getToolPermissionSettings()

	// If auto-approval is disabled, never auto-approve
	if (!settings.autoApprovalEnabled) {
		return false
	}

	// Get the tool category
	const category = getToolCategory(toolName)

	// If the tool doesn't have a category, don't auto-approve
	if (!category) {
		return false
	}

	// Check if the tool should be auto-approved based on its category
	switch (category) {
		case ToolCategory.READ_ONLY:
			return settings.alwaysAllowReadOnly
		case ToolCategory.WRITE:
			return settings.alwaysAllowWrite
		case ToolCategory.EXECUTE:
			return settings.alwaysAllowExecute
		case ToolCategory.BROWSER:
			return settings.alwaysAllowBrowser
		case ToolCategory.MCP:
			return settings.alwaysAllowMcp
		case ToolCategory.MODE_SWITCH:
			return settings.alwaysAllowModeSwitch
		case ToolCategory.SUBTASK:
			return settings.alwaysAllowSubtasks
		default:
			return false
	}
}
