# RooCode CLI Usage Guide

## Overview

The RooCode CLI is a command-line interface for interacting with the RooCode VS Code extension. It allows you to manage profiles, start tasks, and interact with RooCode directly from your terminal.

## Installation

### Prerequisites

- Node.js 14 or higher
- npm
- VS Code with RooCode extension installed
- WebSocket server enabled in RooCode extension settings

### Installing the CLI

```bash
# Install from npm
npm install -g roocli

# Or install from source
git clone https://github.com/RooVetGit/Roo-Code.git
cd Roo-Code/roocli
npm install
npm run build
npm install -g .
```

## Configuration

Before using the CLI, you need to enable the WebSocket server in the RooCode extension:

1. Open VS Code settings (File > Preferences > Settings or Ctrl+,)
2. Search for "roo-cline.websocket.enabled"
3. Set it to `true`
4. Optionally, configure the port with "roo-cline.websocket.port" (default: 8765)
5. Restart VS Code to apply the changes

## Basic Usage

```bash
# Get help
roo --help

# Get command-specific help
roo <command> --help

# Check if RooCode is ready
roo list configs
```

## Command Reference

The RooCode CLI uses a consistent command structure with four main commands:

- `list`: Display information about profiles and tasks
- `create`: Create new profiles and tasks
- `update`: Update existing profiles and tasks
- `delete`: Delete profiles and tasks
- `set`: Set new configurations (legacy, prefer using profile commands)

Each command applies to two main object types: profiles and tasks. Configurations are managed through profile commands.

### List Command

The `list` command retrieves information from RooCode:

```bash
# List all profiles
roo list profiles

# List all profiles with detailed information
roo list profiles --verbose

# List only the active profile
roo list profiles --active

# List active profile with detailed information
roo list profiles --active --verbose

# List all tasks
roo list tasks
```

#### Example Output

```
┌─────────────────────────────────────────────────────────────────┐
│                            Profiles                             │
├─────────────────────────────────────────────────────────────────┤
│ default                                                         │
│ gpt4                                                            │
│ claude                                                          │
└─────────────────────────────────────────────────────────────────┘
```

With verbose option:

```
┌─────────────────────────────────────────────────────────────────┐
│                            Profiles                             │
├─────────────────────────────────────────────────────────────────┤
│ [                                                               │
│   {                                                             │
│     "name": "default",                                          │
│     "provider": "openai",                                       │
│     "id": "config-123",                                         │
│     "isActive": true                                            │
│   },                                                            │
│   {                                                             │
│     "name": "gpt4",                                             │
│     "provider": "openai",                                       │
│     "id": "config-456",                                         │
│     "isActive": false                                           │
│   },                                                            │
│   {                                                             │
│     "name": "claude",                                           │
│     "provider": "anthropic",                                    │
│     "id": "config-789",                                         │
│     "isActive": false                                           │
│   }                                                             │
│ ]                                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Create Command

The `create` command creates new objects:

```bash
# Create a new profile with configuration
roo create profile --name "GPT-4" --provider openai --apikey "sk-your-key" --model "gpt-4"

# Create a new profile with OpenRouter configuration and permissions
roo create profile --name "Claude" --provider openrouter --apikey "your-api-key" --model "anthropic/claude-3.7-sonnet" --allow-execute true --allow-browser true

# Create a secure profile with all permissions disabled
roo create profile --name "Secure-Profile" --provider openrouter --apikey "your-api-key" --secure

# Create a new task
roo create task --mode "code" --message "Create a React component"
```

### Set Command

The `set` command adds new configurations (legacy approach):

```bash
# Set a new configuration from JSON (use create profile instead for new configurations)
roo set config --json '{"apiProvider": "openai", "openAiModelId": "gpt-4", "openAiApiKey": "sk-your-key"}'

# Set a new configuration from a file
roo set config --file path/to/config.json
```

Note: For most use cases, it's recommended to use the `create profile` command instead of `set config` as it provides a more complete solution with profile creation and permission settings.

### Update Command

The `update` command updates existing objects:

```bash
# Update a profile with new configuration
roo update profile --name "GPT-4" --provider openai --model "gpt-4-turbo"

# Update a profile with new permissions
roo update profile --name "GPT-4" --allow-execute false --allow-browser false

# Set a profile as active
roo update profile --name "GPT-4" --active

# Send a message to the current task
roo update task --message "Add a button to the component"

# Change the mode of the current task
roo update task --mode "debug"

# Interact with the current task
roo update task --interact primary
```

### Profile Command

Note: The standalone profile command has been deprecated. Use the create, update, and delete commands with the profile subcommand instead.

```bash
# Create a new profile (use this instead)
roo create profile --name "GPT-4" --provider openai --apikey "your-api-key" --model "gpt-4"

# Set a profile as active (use this instead)
roo update profile --name "GPT-4" --active

# Delete a profile (use this instead)
roo delete profile --name "GPT-4"
```

### Delete Command

The `delete` command removes objects:

```bash
# Delete a profile
roo delete profile --name "GPT-4"

# Delete a profile without confirmation
roo delete profile --name "GPT-4" --force

# Delete a task
roo delete task --id "task-123"
```

## Common Workflows

### Setting Up a New Profile and Starting a Task

```bash
# Create a new profile with configuration and set it as active
roo create profile --name "My Project" --provider openai --apikey "your-api-key" --model "gpt-4" --active

# Start a new task
roo create task --mode "code" --message "Create a React component that fetches data from an API"
```

### Continuing Work on an Existing Task

```bash
# List the current tasks
roo list tasks

# Send additional instructions to the current task
roo update task --message "Now add error handling to the API request"

# Interact with the task
roo update task --interact primary
```

### Switching Between Different Projects

```bash
# List all profiles
roo list profiles

# Switch to a different profile
roo update profile --name "Project B" --active

# Start a new task for this project
roo create task --mode "code" --message "Update the database schema"
```

### Managing Permissions

```bash
# Create a secure profile with all permissions disabled
roo create profile --name "Secure-Profile" --provider openrouter --apikey "your-api-key" --secure

# Create a profile with specific permissions
roo create profile --name "Custom-Permissions" --provider openai --apikey "your-api-key" --model "gpt-4" \
  --allow-read true --allow-write true --allow-execute false --allow-browser false \
  --allow-mcp true --allow-mode-switch true --allow-subtasks false

# Update permissions for an existing profile
roo update profile --name "My-Profile" --allow-execute false --allow-browser false
```

## Tips and Best Practices

### Effective Task Descriptions

- Be specific and clear in your task descriptions
- Include relevant context and requirements
- Break complex tasks into smaller, manageable pieces

Example:

```bash
# Too vague
roo create task --mode "code" --message "Create a component"

# Better
roo create task --mode "code" --message "Create a React form component with email and password fields, validation, and a submit button that calls the login API"
```

### Managing Multiple Tasks

- Use `roo list tasks` to see all active tasks
- Clear completed tasks to keep your workspace organized

### Troubleshooting

If you encounter issues:

1. Check if the WebSocket server is enabled in VS Code settings
2. Verify VS Code is running with the RooCode extension active
3. Check the connection with `roo list configs`
4. Look for error messages in the terminal output
5. Restart VS Code and try again

## Advanced Usage

### Scripting with the CLI

You can use the RooCode CLI in scripts to automate workflows:

```bash
#!/bin/bash
# Example script to start a task and wait for completion

# Start a new task
TASK_ID=$(roo create task --mode "code" --message "Generate unit tests for the user service" | grep -oP 'ID: \K[^"]+')

# Wait for the task to complete (in a real script, you would implement a proper waiting mechanism)
echo "Task started with ID: $TASK_ID. Waiting for completion..."

# When done, send a final message
roo update task --message "Tests generated successfully"
```

### Using the CLI Programmatically

You can also use the CLI programmatically in Node.js applications:

```javascript
const { exec } = require("child_process")

function startRooTask(taskDescription) {
	return new Promise((resolve, reject) => {
		exec(`roo create task --mode "code" --message "${taskDescription}"`, (error, stdout, stderr) => {
			if (error) {
				reject(error)
				return
			}

			// Extract task ID from output
			const match = stdout.match(/ID: ([a-zA-Z0-9-]+)/)
			if (match && match[1]) {
				resolve(match[1])
			} else {
				reject(new Error("Could not extract task ID"))
			}
		})
	})
}

// Usage
startRooTask("Create a React component")
	.then((taskId) => {
		console.log(`Task started with ID: ${taskId}`)
	})
	.catch((error) => {
		console.error("Error starting task:", error)
	})
```

## Conclusion

The RooCode CLI provides a powerful way to interact with RooCode from the command line. By mastering these commands and workflows, you can integrate RooCode into your development process more efficiently.

For more information, visit the [RooCode documentation](https://docs.roocode.com) or join the [RooCode Discord community](https://discord.gg/roocode).
