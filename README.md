# Black Forest Labs MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that provides AI assistants with tools to generate images using the [Black Forest Labs](https://blackforestlabs.ai) API. This server enables text-to-image generation using FLUX models.

## Features

- **Tools:**
  - `generate_image_flux_dev`: Generate images using FLUX.1 [dev] model
  - `generate_image_flux_pro`: Generate images using FLUX.1 [pro] model
  - `generate_image_flux_pro_ultra`: Generate high-resolution images (up to 4MP) using FLUX1.1 [pro] Ultra
  - `get_request_status`: Check the status of an image generation request

- **Resources:**
  - `bfl://requests/`: List all image generation requests
  - `bfl://requests/{requestId}`: Get details for a specific request

## Prerequisites

- Node 22+
- Black Forest Labs API key ([get one here](https://docs.bfl.ai))

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
- "Check the status of request abc-123"

The server automatically polls the BFL API until image generation is complete and returns the image URL (valid for 10 minutes).

## Development

```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript
npm run dev        # Run in development mode
npm run lint       # Run linter
```

## License

Released under the MIT License. See the [LICENSE](LICENSE) file for details.
