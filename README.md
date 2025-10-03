# Black Forest Labs MCP Server ![NPM Version](https://img.shields.io/npm/v/%40fernforestgames%2Fmcp-server-bfl)

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that provides AI assistants with tools to generate images using the [Black Forest Labs](https://bfl.ai) API. This server enables text-to-image generation using FLUX models.

## Features

- Tool to generate images using FLUX models
- Resources to check request status and download generated images

## Prerequisites

- Node 22+
- Black Forest Labs API key

## MCP Configuration

Add this server to your `.mcp.json`:

```json
{
  "mcpServers": {
    "bfl": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "@fernforestgames/mcp-server-bfl"
      ],
      "env": {
        "BFL_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Usage

Once configured, you can ask your AI assistant to generate images:

- "Generate an image of a sunset over mountains"
- "Create a high-resolution photo of a cat using FLUX Pro Ultra"

By default, the server automatically polls the BFL API until image generation is complete and returns the image URL (valid for 10 minutes). You can also ask your AI assistant to download the image result directly.

## License

Released under the MIT License. See the [LICENSE](LICENSE) file for details.
