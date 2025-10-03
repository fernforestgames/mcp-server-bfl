# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript MCP (Model Context Protocol) server for Black Forest Labs' image generation API. The server implements the MCP specification to provide tools that can generate images using FLUX models through the BFL API.

## Essential Commands

**Development:**
```bash
npm run dev          # Watch mode compilation
npm run build        # Compile TypeScript to dist/
npm run start        # Run compiled server
```

**Quality Assurance:**
```bash
npm run lint         # ESLint with TypeScript support
```

**All commands run automatically in CI via GitHub Actions on pushes to main.**

## MCP SDK Implementation Notes

**Resource Registration:**
- Static resources: `server.registerResource(name, uri, metadata, callback)`
- Dynamic resources with URI templates: `server.registerResource(name, new ResourceTemplate(uriTemplate, { list: undefined }), metadata, callback)`
- Resource callbacks must return `{ contents: [{ uri: uri.href, text: string }] }`
- Template variables are passed as second parameter: `async (uri, { variableName }) => {}`

**Tool Registration:**
- Use `server.registerTool(name, { title, description, inputSchema }, callback)`
- Input schema uses Zod validators: `{ paramName: z.string().optional().describe("...") }`
- Tool callbacks return `{ content: [{ type: "text", text: string }] }`

**TypeScript Considerations:**
- Import ResourceTemplate: `import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"`
- Optional properties in interfaces must use conditional spreading: `...(args && { args })`
- Resource template callbacks are strongly typed with variable destructuring

**API Integration:**
- BFL API uses POST requests to initiate image generation, returning a request ID
- Results are polled via GET requests to `/v1/get_result?id={requestId}`
- Image URLs are signed and valid for 10 minutes

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
