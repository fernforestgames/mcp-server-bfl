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
  prompt?: string;
  image_prompt?: string;
  input_image?: string;
  input_image_2?: string;
  input_image_3?: string;
  input_image_4?: string;
  aspect_ratio?: string;
  width?: number;
  height?: number;
  seed?: number;
  prompt_upsampling?: boolean;
  safety_tolerance?: number;
  output_format?: string;
  raw?: boolean;
  image_prompt_strength?: number;
}

interface ImageGenerationResponse {
  id: string;
  polling_url: string;
}

interface ResultResponse {
  id: string;
  status: "Pending" | "Ready" | "Error";
  result?: {
    sample: string;
  };
  error?: string;
}

// Helper function to make API requests
async function makeBFLRequest(endpoint: string, body: ImageGenerationRequest): Promise<ImageGenerationResponse> {
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

// Helper function to get result by request ID using the BFL API
async function getResultById(requestId: string): Promise<ResultResponse> {
  const response = await fetch(`${API_BASE_URL}/v1/get_result?id=${requestId}`, {
    method: "GET",
    headers: {
      "x-key": apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BFL API error (${response.status}): ${errorText}`);
  }

  return await response.json() as ResultResponse;
}

// Helper function to poll for results using polling URL
async function getResult(pollingUrl: string): Promise<ResultResponse> {
  const response = await fetch(pollingUrl, {
    method: "GET",
    headers: {
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
async function pollUntilComplete(pollingUrl: string, maxAttempts = 60, intervalMs = 2000): Promise<ResultResponse> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await getResult(pollingUrl);

    if (result.status === "Ready" || result.status === "Error") {
      return result;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Polling timeout after ${maxAttempts} attempts`);
}

// Model endpoint mapping
const MODEL_ENDPOINTS: Record<string, string> = {
  "flux-dev": "/v1/flux-dev",
  "flux-pro": "/v1/flux-pro-1.1",
  "flux-pro-ultra": "/v1/flux-pro-1.1-ultra",
  "flux-kontext-pro": "/v1/flux-kontext-pro",
  "flux-kontext-max": "/v1/flux-kontext-max"
};

// Tool to generate images
server.registerTool("generate_image",
  {
    title: "Generate Image",
    description: "Generate an image using a FLUX model. By default waits for completion and returns the image URL. Set wait=false to return immediately with request ID.",
    inputSchema: {
      prompt: z.string().describe("Text description of the desired image"),
      model: z.enum(['flux-dev', 'flux-pro', 'flux-pro-ultra', 'flux-kontext-pro', 'flux-kontext-max']).describe("Model to use for generation: 'flux-dev' (FLUX.1 [dev]), 'flux-pro' (FLUX 1.1 [pro]), 'flux-pro-ultra' (FLUX 1.1 [pro] Ultra), 'flux-kontext-pro' (FLUX Kontext Pro), 'flux-kontext-max' (FLUX Kontext Max)"),
      wait: z.boolean().default(true).describe("Whether to wait for generation to complete. If true, polls until ready. If false, returns request ID immediately"),

      // Image inputs
      image_prompt: z.string().optional().describe("Base64 encoded image for Flux Redux (flux-pro, flux-pro-ultra) or image remixing (flux-pro-ultra)"),
      input_image: z.string().optional().describe("Base64 encoded image or URL to use with Kontext (flux-kontext-pro, flux-kontext-max)"),
      input_image_2: z.string().optional().describe("Additional reference image for experimental Multiref (flux-kontext-pro, flux-kontext-max)"),
      input_image_3: z.string().optional().describe("Additional reference image for experimental Multiref (flux-kontext-pro, flux-kontext-max)"),
      input_image_4: z.string().optional().describe("Additional reference image for experimental Multiref (flux-kontext-pro, flux-kontext-max)"),

      // Dimensions
      aspect_ratio: z.string().optional().describe("Image aspect ratio (e.g., '1:1', '16:9', '9:16', '21:9'). Used by flux-pro-ultra, flux-kontext-pro, flux-kontext-max"),
      width: z.number().optional().describe("Image width in pixels (256-1440, multiple of 32). Used by flux-pro"),
      height: z.number().optional().describe("Image height in pixels (256-1440, multiple of 32). Used by flux-pro"),

      // Generation parameters
      seed: z.number().optional().describe("Seed for reproducibility. Optional for all models"),
      prompt_upsampling: z.boolean().optional().describe("Whether to perform upsampling on the prompt. Available for all models"),
      safety_tolerance: z.number().optional().describe("Safety tolerance level (0-6, default: 2). Available for all models"),
      output_format: z.enum(['jpeg', 'png']).optional().describe("Output format (default: 'jpeg' for flux-pro/pro-ultra, 'png' for kontext models)"),

      // Pro Ultra specific
      raw: z.boolean().optional().describe("Generate less processed, more natural-looking images. Only for flux-pro-ultra"),
      image_prompt_strength: z.number().optional().describe("Blend strength between prompt and image_prompt (0-1, default: 0.1). Only for flux-pro-ultra")
    }
  },
  async ({ prompt, model, wait, image_prompt, input_image, input_image_2, input_image_3, input_image_4, aspect_ratio, width, height, seed, prompt_upsampling, safety_tolerance, output_format, raw, image_prompt_strength }) => {
    try {
      const endpoint = MODEL_ENDPOINTS[model];
      if (!endpoint) {
        return {
          content: [{ type: "text", text: `Invalid model: ${model}. Valid options: ${Object.keys(MODEL_ENDPOINTS).join(", ")}` }]
        };
      }

      const requestBody: ImageGenerationRequest = {
        ...(prompt && { prompt }),
        ...(image_prompt && { image_prompt }),
        ...(input_image && { input_image }),
        ...(input_image_2 && { input_image_2 }),
        ...(input_image_3 && { input_image_3 }),
        ...(input_image_4 && { input_image_4 }),
        ...(aspect_ratio && { aspect_ratio }),
        ...(width && { width }),
        ...(height && { height }),
        ...(seed !== undefined && { seed }),
        ...(prompt_upsampling !== undefined && { prompt_upsampling }),
        ...(safety_tolerance !== undefined && { safety_tolerance }),
        ...(output_format && { output_format }),
        ...(raw !== undefined && { raw }),
        ...(image_prompt_strength !== undefined && { image_prompt_strength })
      };

      const initResponse = await makeBFLRequest(endpoint, requestBody);

      if (!wait) {
        return {
          content: [{ type: "text", text: `Image generation request submitted.\n\nRequest ID: ${initResponse.id}\nModel: ${model}\n\nUse the bfl://requests/${initResponse.id} resource to check status.` }]
        };
      }

      const result = await pollUntilComplete(initResponse.polling_url);

      if (result.status === "Error") {
        return {
          content: [{ type: "text", text: `Image generation failed: ${result.error}` }]
        };
      }

      return {
        content: [
          { type: "text", text: `Image generated successfully!\n\nRequest ID: ${initResponse.id}\nModel: ${model}\nImage URL: ${result.result?.sample}\n\nNote: URL is valid for 10 minutes.` }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to generate image: ${error}` }]
      };
    }
  }
);

// Resource to get details of a specific request
server.registerResource("request_details", new ResourceTemplate("bfl://requests/{requestId}", {
  list: undefined,
}),
  {
    title: "Request Details",
    description: "Get details for a specific image generation request",
    mimeType: "application/json"
  },
  async (uri, { requestId }) => {
    try {
      const result = await getResultById(requestId as string);

      const details = {
        id: result.id,
        status: result.status,
        result: result.result?.sample,
        error: result.error
      };

      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(details, null, 2)
        }]
      };
    } catch (error) {
      throw new Error(`Failed to fetch request details: ${error}`);
    }
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
