# RooCLI

A command line interface for RooCode that communicates with the RooCode extension via WebSocket.

## Installation

```bash
# Install dependencies
npm install

# Build the CLI
npm run build

# Install globally
npm install -g .
```

## Usage

```bash
# Get help
roo --help

# Get command-specific help
roo <command> --help
```

## Commands

The RooCode CLI uses a consistent command structure with the following main commands:

- `list`: Display information about profiles and tasks
- `create`: Create new profiles and tasks
- `update`: Update existing profiles and tasks
- `delete`: Delete profiles and tasks
- `set`: Set new configurations

Each command applies to two main object types: profiles and tasks. Configurations are managed through profile commands.

### List Command

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

### Create Command

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

```bash
# Set a new configuration from JSON (use create profile instead for new configurations)
roo set config --json '{"apiProvider": "openai", "openAiModelId": "gpt-4", "openAiApiKey": "sk-your-key"}'

# Set a new configuration from a file
roo set config --file path/to/config.json
```

Note: For most use cases, it's recommended to use the `create profile` command instead of `set config` as it provides a more complete solution with profile creation and permission settings.

### Update Command

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

### Delete Command

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

## Development

```bash
# Run in development mode
npm run dev

# Build the CLI
npm run build
```

## Requirements

- Node.js 14 or higher
- RooCode extension must be running with the WebSocket server enabled

For more detailed usage instructions, see [USAGE.md](./USAGE.md).
