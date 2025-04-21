import chalk from "chalk"
import { Command } from "commander"
import { displayBox } from "../utils/display"
import { WebSocketClient } from "../utils/websocket-client"
import { listProfilesCommand } from "./profile"

/**
 * Create the list command
 * @param wsClient The WebSocket client
 * @returns The list command
 */
export function listCommand(wsClient: WebSocketClient): Command {
	const command = new Command("list")
		.description("List profiles or tasks")
		.addCommand(listProfilesCommand(wsClient))
		.addCommand(listTasksCommand(wsClient))

	return command
}

/**
 * Create the list tasks command
 * @param wsClient The WebSocket client
 * @returns The list tasks command
 */
function listTasksCommand(wsClient: WebSocketClient): Command {
	return new Command("tasks").description("List all tasks").action(async () => {
		try {
			const tasks = await wsClient.sendCommand("getCurrentTaskStack")
			displayBox("Current Task Stack", tasks.length > 0 ? tasks.join("\n") : "No active tasks", "info")
		} catch (error) {
			console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
		}
	})
}
