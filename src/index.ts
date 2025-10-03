#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import "dotenv/config";
import { z } from "zod";

// Get BFL API key from environment variable
const apiKey = process.env['BFL_API_KEY'];
if (!apiKey) {
  console.error("Error: BFL_API_KEY environment variable must be set");
  process.exit(1);
}

// API configuration
const API_BASE_URL = "https://api.bfl.ai";

const server = new McpServer({
  name: "mcp-server-bfl",
  version: "0.1.0",
});

// Types for image generation
interface ImageGenerationRequest {
  prompt: string;
  aspect_ratio?: string;
  width?: number;
  height?: number;
  num_images?: number;
  safety_tolerance?: number;
}

interface ImageGenerationResponse {
  id: string;
}

interface ResultResponse {
  id: string;
  status: "Pending" | "Ready" | "Error";
  result?: {
    sample: string;
  };
  error?: string;
}

// Storage for active requests
const activeRequests = new Map<string, {
  id: string;
  model: string;
  prompt: string;
  status: string;
  result?: string;
  error?: string;
  createdAt: Date;
}>();

// Helper function to make API requests
async function makeBFLRequest(endpoint: string, body: Record<string, unknown>): Promise<ImageGenerationResponse> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BFL API error (${response.status}): ${errorText}`);
  }

  return await response.json() as ImageGenerationResponse;
}

// Helper function to poll for results
async function getResult(requestId: string): Promise<ResultResponse> {
  const response = await fetch(`${API_BASE_URL}/v1/get_result?id=${requestId}`, {
    method: "GET",
    headers: {
      "accept": "application/json",
      "x-key": apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BFL API error (${response.status}): ${errorText}`);
  }

  return await response.json() as ResultResponse;
}

// Helper function to poll until completion
async function pollUntilComplete(requestId: string, maxAttempts = 60, intervalMs = 2000): Promise<ResultResponse> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await getResult(requestId);

    if (result.status === "Ready" || result.status === "Error") {
      return result;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Polling timeout after ${maxAttempts} attempts`);
}

// Tool to generate images with FLUX.1 [dev]
server.registerTool("generate_image_flux_dev",
  {
    title: "Generate Image (FLUX.1 [dev])",
    description: "Generate an image using FLUX.1 [dev] model. Waits for completion and returns the image URL.",
    inputSchema: {
      prompt: z.string().describe("Text description of the desired image"),
      aspect_ratio: z.string().optional().describe("Image aspect ratio (e.g., '1:1', '16:9', '9:16'). Default: '1:1'"),
      width: z.number().optional().describe("Image width in pixels"),
      height: z.number().optional().describe("Image height in pixels"),
      num_images: z.number().optional().describe("Number of images to generate (1-4). Default: 1"),
      safety_tolerance: z.number().optional().describe("Safety tolerance level (0-6). Default: 2")
    }
  },
  async ({ prompt, aspect_ratio, width, height, num_images, safety_tolerance }) => {
    try {
      const requestBody: ImageGenerationRequest = {
        prompt,
        ...(aspect_ratio && { aspect_ratio }),
        ...(width && { width }),
        ...(height && { height }),
        ...(num_images && { num_images }),
        ...(safety_tolerance !== undefined && { safety_tolerance })
      };

      const initResponse = await makeBFLRequest("/v1/flux-dev", requestBody);

      activeRequests.set(initResponse.id, {
        id: initResponse.id,
        model: "flux-dev",
        prompt,
        status: "Pending",
        createdAt: new Date()
      });

      const result = await pollUntilComplete(initResponse.id);

      if (result.status === "Error") {
        activeRequests.get(initResponse.id)!.status = "Error";
        activeRequests.get(initResponse.id)!.error = result.error;
        return {
          content: [{ type: "text", text: `Image generation failed: ${result.error}` }]
        };
      }

      activeRequests.get(initResponse.id)!.status = "Ready";
      activeRequests.get(initResponse.id)!.result = result.result?.sample;

      return {
        content: [
          { type: "text", text: `Image generated successfully!\n\nRequest ID: ${initResponse.id}\nImage URL: ${result.result?.sample}\n\nNote: URL is valid for 10 minutes.` }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to generate image: ${error}` }]
      };
    }
  }
);

// Tool to generate images with FLUX.1 [pro]
server.registerTool("generate_image_flux_pro",
  {
    title: "Generate Image (FLUX.1 [pro])",
    description: "Generate an image using FLUX.1 [pro] model. Waits for completion and returns the image URL.",
    inputSchema: {
      prompt: z.string().describe("Text description of the desired image"),
      aspect_ratio: z.string().optional().describe("Image aspect ratio (e.g., '1:1', '16:9', '9:16'). Default: '1:1'"),
      width: z.number().optional().describe("Image width in pixels"),
      height: z.number().optional().describe("Image height in pixels"),
      num_images: z.number().optional().describe("Number of images to generate (1-4). Default: 1"),
      safety_tolerance: z.number().optional().describe("Safety tolerance level (0-6). Default: 2")
    }
  },
  async ({ prompt, aspect_ratio, width, height, num_images, safety_tolerance }) => {
    try {
      const requestBody: ImageGenerationRequest = {
        prompt,
        ...(aspect_ratio && { aspect_ratio }),
        ...(width && { width }),
        ...(height && { height }),
        ...(num_images && { num_images }),
        ...(safety_tolerance !== undefined && { safety_tolerance })
      };

      const initResponse = await makeBFLRequest("/v1/flux-pro-1.1", requestBody);

      activeRequests.set(initResponse.id, {
        id: initResponse.id,
        model: "flux-pro-1.1",
        prompt,
        status: "Pending",
        createdAt: new Date()
      });

      const result = await pollUntilComplete(initResponse.id);

      if (result.status === "Error") {
        activeRequests.get(initResponse.id)!.status = "Error";
        activeRequests.get(initResponse.id)!.error = result.error;
        return {
          content: [{ type: "text", text: `Image generation failed: ${result.error}` }]
        };
      }

      activeRequests.get(initResponse.id)!.status = "Ready";
      activeRequests.get(initResponse.id)!.result = result.result?.sample;

      return {
        content: [
          { type: "text", text: `Image generated successfully!\n\nRequest ID: ${initResponse.id}\nImage URL: ${result.result?.sample}\n\nNote: URL is valid for 10 minutes.` }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to generate image: ${error}` }]
      };
    }
  }
);

// Tool to generate images with FLUX.1.1 [pro] ultra
server.registerTool("generate_image_flux_pro_ultra",
  {
    title: "Generate Image (FLUX1.1 [pro] Ultra)",
    description: "Generate a high-resolution image (up to 4MP) using FLUX1.1 [pro] Ultra model. Waits for completion and returns the image URL.",
    inputSchema: {
      prompt: z.string().describe("Text description of the desired image"),
      aspect_ratio: z.string().optional().describe("Image aspect ratio (e.g., '1:1', '16:9', '9:16'). Default: '1:1'"),
      width: z.number().optional().describe("Image width in pixels"),
      height: z.number().optional().describe("Image height in pixels"),
      safety_tolerance: z.number().optional().describe("Safety tolerance level (0-6). Default: 2")
    }
  },
  async ({ prompt, aspect_ratio, width, height, safety_tolerance }) => {
    try {
      const requestBody: ImageGenerationRequest = {
        prompt,
        ...(aspect_ratio && { aspect_ratio }),
        ...(width && { width }),
        ...(height && { height }),
        ...(safety_tolerance !== undefined && { safety_tolerance })
      };

      const initResponse = await makeBFLRequest("/v1/flux-pro-1.1-ultra", requestBody);

      activeRequests.set(initResponse.id, {
        id: initResponse.id,
        model: "flux-pro-1.1-ultra",
        prompt,
        status: "Pending",
        createdAt: new Date()
      });

      const result = await pollUntilComplete(initResponse.id);

      if (result.status === "Error") {
        activeRequests.get(initResponse.id)!.status = "Error";
        activeRequests.get(initResponse.id)!.error = result.error;
        return {
          content: [{ type: "text", text: `Image generation failed: ${result.error}` }]
        };
      }

      activeRequests.get(initResponse.id)!.status = "Ready";
      activeRequests.get(initResponse.id)!.result = result.result?.sample;

      return {
        content: [
          { type: "text", text: `Image generated successfully!\n\nRequest ID: ${initResponse.id}\nImage URL: ${result.result?.sample}\n\nNote: URL is valid for 10 minutes.` }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to generate image: ${error}` }]
      };
    }
  }
);

// Tool to check status of a request
server.registerTool("get_request_status",
  {
    title: "Get Request Status",
    description: "Check the status of an image generation request by ID",
    inputSchema: {
      requestId: z.string().describe("The request ID to check")
    }
  },
  async ({ requestId }) => {
    try {
      const result = await getResult(requestId);

      if (activeRequests.has(requestId)) {
        const request = activeRequests.get(requestId)!;
        request.status = result.status;
        if (result.status === "Ready") {
          request.result = result.result?.sample;
        } else if (result.status === "Error") {
          request.error = result.error;
        }
      }

      let responseText = `Request ID: ${requestId}\nStatus: ${result.status}`;

      if (result.status === "Ready" && result.result) {
        responseText += `\nImage URL: ${result.result.sample}\n\nNote: URL is valid for 10 minutes.`;
      } else if (result.status === "Error") {
        responseText += `\nError: ${result.error}`;
      }

      return {
        content: [{ type: "text", text: responseText }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to get status: ${error}` }]
      };
    }
  }
);

// Resource to list all requests
server.registerResource("requests_list", "bfl://requests/",
  {
    title: "Image Generation Requests",
    description: "List all image generation requests",
    mimeType: "application/json"
  },
  async (uri) => {
    const requests = Array.from(activeRequests.values()).map(req => ({
      id: req.id,
      model: req.model,
      prompt: req.prompt,
      status: req.status,
      createdAt: req.createdAt.toISOString(),
      result: req.result,
      error: req.error
    }));

    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(requests, null, 2)
      }]
    };
  }
);

// Resource to get details of a specific request
server.registerResource("request_details", new ResourceTemplate("bfl://requests/{requestId}", {
  list: async () => {
    const resources = Array.from(activeRequests.keys()).map(requestId => ({
      uri: `bfl://requests/${requestId}`,
      name: `request-${requestId}`,
      mimeType: "application/json"
    }));
    return { resources };
  }
}),
  {
    title: "Request Details",
    description: "Get details for a specific image generation request",
    mimeType: "application/json"
  },
  async (uri, { requestId }) => {
    const request = activeRequests.get(requestId as string);

    if (!request) {
      throw new Error(`No request found with ID: ${requestId}`);
    }

    const details = {
      id: request.id,
      model: request.model,
      prompt: request.prompt,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      result: request.result,
      error: request.error
    };

    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(details, null, 2)
      }]
    };
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
