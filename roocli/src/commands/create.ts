import chalk from "chalk"
import { Command } from "commander"
import { createProfileCommand } from "../commands/profile"
import { displayBox, displayTextInput } from "../utils/display"
import { WebSocketClient } from "../utils/websocket-client"
import { setupTaskEventListeners, waitForTaskCompletion } from "./task"

/**
 * Create the create command
 * @param wsClient The WebSocket client
 * @returns The create command
 */
export function createCommand(wsClient: WebSocketClient): Command {
	const command = new Command("create")
		.description("Create a new profile or task")
		.addCommand(createProfileCommand(wsClient))
		.addCommand(createTaskCommand(wsClient))

	return command
}

/**
 * Create the create task command
 * @param wsClient The WebSocket client
 * @returns The create task command
 */
function createTaskCommand(wsClient: WebSocketClient): Command {
	return new Command("task")
		.description("Create a new task")
		.requiredOption("--mode <mode>", "Task mode")
		.option("--message <message>", "Initial message for the task")
		.option("--interactive", "Enter message interactively")
		.action(async (options) => {
			try {
				// Get current configuration
				const currentConfig = await wsClient.sendCommand("getConfiguration")

				// Handle interactive message input
				let taskMessage = options.message

				if (options.interactive || !taskMessage) {
					taskMessage = await displayTextInput("Enter your task message:")
				}

				if (!taskMessage) {
					console.log(chalk.yellow("No message provided. Task creation cancelled."))
					return
				}

				const params: any = {
					configuration: currentConfig,
					text: taskMessage,
					newTab: false,
				}

				// Set the mode in the configuration
				if (options.mode) {
					if (!params.configuration) {
						params.configuration = {}
					}
					params.configuration.mode = options.mode
				}

				const taskId = await wsClient.sendCommand("startNewTask", params)
				displayBox("Task Created", `Task created with ID: ${taskId}`, "success")

				// Set up event listeners for the task
				await setupTaskEventListeners(wsClient, taskId)

				// Wait for the task to complete or timeout
				if (wsClient.isDebugMode()) {
					console.log(chalk.blue("Waiting for task to respond..."))
				}
				await waitForTaskCompletion(wsClient, taskId)
			} catch (error) {
				console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
			}
		})
}
