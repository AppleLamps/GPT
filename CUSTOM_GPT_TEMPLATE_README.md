# Custom GPT Template Guide

This guide explains how to create a Custom GPT configuration file that can be imported into the app.

## Required Fields

- `name` (required): The name of your Custom GPT
- `description` (required): A brief description of what your GPT does
- `instructions` (required): The system prompt/instructions for your GPT

## Optional Fields

- `capabilities`: Object containing boolean flags for GPT capabilities
  - `webSearch`: Whether the GPT can perform web searches
  - `imageGeneration`: Whether the GPT can generate images

- `knowledgeFiles`: Array of knowledge files attached to the GPT (usually empty when importing)

## Example

```json
{
  "name": "Example Custom GPT",
  "description": "A helpful assistant that specializes in coding tasks",
  "instructions": "You are a helpful coding assistant. You help users write clean, efficient code and solve programming problems.",
  "capabilities": {
    "webSearch": true,
    "imageGeneration": false
  },
  "knowledgeFiles": []
}
```

## Import Instructions

1. Create a new JSON file with the structure above
2. Fill in the required fields
3. Set capabilities as needed
4. Save the file with a `.json` extension
5. Import the file using the Import button in the sidebar

## Validation

Before importing, ensure your JSON:
- Contains all required fields (`name`, `description`, `instructions`)
- Is valid JSON format
- Has the correct structure for capabilities if included

## Best Practices

1. Keep instructions clear and specific
2. Include relevant examples
3. Be explicit about constraints
4. Use descriptive tags
5. Keep the configuration focused on a specific use case

## Additional Information

### Context
The `context` object provides additional background information:
- `codebase`: Description of the type of code or projects the GPT works with
- `preferences`: Specific preferences or guidelines for the GPT to follow

### Tools
The `tools` array lists the tools available to your GPT:
- Each tool should have a `name` and `description`
- Only include tools that are actually available to your GPT

### Examples
The `examples` array contains sample interactions:
- Each example should have a `user` and `assistant` message
- Use these to demonstrate ideal interactions

### Constraints
The `constraints` array lists specific rules or limitations:
- Each constraint should be clear and actionable
- Use these to guide the GPT's behavior

### Metadata
The `metadata` object contains additional information:
- `author`: Creator of the GPT
- `version`: Version number
- `created_at`: Creation date
- `tags`: Keywords related to the GPT's functionality 