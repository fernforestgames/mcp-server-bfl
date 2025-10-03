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

// Zod schemas for API responses
const imageGenerationResponseSchema = z.object({
  id: z.string(),
  polling_url: z.string()
});

const resultResponseSchema = z.object({
  id: z.string(),
  status: z.enum(["Pending", "Ready", "Error"]),
  result: z.object({
    sample: z.string()
  }).nullish(),
  error: z.string().nullish()
});

type ImageGenerationResponse = z.infer<typeof imageGenerationResponseSchema>;
type ResultResponse = z.infer<typeof resultResponseSchema>;

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

  const json = await response.json();
  return imageGenerationResponseSchema.parse(json);
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

  const json = await response.json();
  return resultResponseSchema.parse(json);
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

  const json = await response.json();
  return resultResponseSchema.parse(json);
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

// Common parameters shared across all models
const commonParams = {
  wait: z.boolean().default(true).describe("Whether to wait for generation to complete. If true, polls until ready. If false, returns request ID immediately"),
  seed: z.number().optional().describe("Seed for reproducibility"),
  prompt_upsampling: z.boolean().optional().describe("Whether to perform upsampling on the prompt"),
  safety_tolerance: z.number().optional().describe("Safety tolerance level (0-6, default: 2)"),
  output_format: z.enum(['jpeg', 'png']).optional().describe("Output format (default: 'jpeg' for flux-pro/pro-ultra, 'png' for kontext models)")
};

// Define schemas for each model type
const fluxDevSchema = z.object({
  model: z.literal('flux-dev'),
  prompt: z.string().describe("Text description of the desired image"),
  width: z.number().optional().describe("Image width in pixels (256-1440, multiple of 32)"),
  height: z.number().optional().describe("Image height in pixels (256-1440, multiple of 32)"),
  ...commonParams
});

const fluxProSchema = z.object({
  model: z.literal('flux-pro'),
  prompt: z.string().describe("Text description of the desired image"),
  width: z.number().optional().describe("Image width in pixels (256-1440, multiple of 32)"),
  height: z.number().optional().describe("Image height in pixels (256-1440, multiple of 32)"),
  image_prompt: z.string().optional().describe("Base64 encoded image for Flux Redux"),
  ...commonParams
});

const fluxProUltraSchema = z.object({
  model: z.literal('flux-pro-ultra'),
  prompt: z.string().describe("Text description of the desired image"),
  aspect_ratio: z.string().optional().describe("Image aspect ratio (e.g., '1:1', '16:9', '9:16', '21:9')"),
  image_prompt: z.string().optional().describe("Base64 encoded image for Flux Redux or image remixing"),
  image_prompt_strength: z.number().optional().describe("Blend strength between prompt and image_prompt (0-1, default: 0.1)"),
  raw: z.boolean().optional().describe("Generate less processed, more natural-looking images"),
  ...commonParams
});

const fluxKontextProSchema = z.object({
  model: z.literal('flux-kontext-pro'),
  prompt: z.string().describe("Text description of the desired image"),
  aspect_ratio: z.string().optional().describe("Image aspect ratio (e.g., '1:1', '16:9', '9:16', '21:9')"),
  input_image: z.string().optional().describe("Base64 encoded image or URL to use with Kontext"),
  input_image_2: z.string().optional().describe("Additional reference image for experimental Multiref"),
  input_image_3: z.string().optional().describe("Additional reference image for experimental Multiref"),
  input_image_4: z.string().optional().describe("Additional reference image for experimental Multiref"),
  ...commonParams
});

const fluxKontextMaxSchema = z.object({
  model: z.literal('flux-kontext-max'),
  prompt: z.string().describe("Text description of the desired image"),
  aspect_ratio: z.string().optional().describe("Image aspect ratio (e.g., '1:1', '16:9', '9:16', '21:9')"),
  input_image: z.string().optional().describe("Base64 encoded image or URL to use with Kontext"),
  input_image_2: z.string().optional().describe("Additional reference image for experimental Multiref"),
  input_image_3: z.string().optional().describe("Additional reference image for experimental Multiref"),
  input_image_4: z.string().optional().describe("Additional reference image for experimental Multiref"),
  ...commonParams
});

// Union all schemas with discriminated union on 'model'
const generateImageSchema = {
  params: z.discriminatedUnion('model', [
    fluxDevSchema,
    fluxProSchema,
    fluxProUltraSchema,
    fluxKontextProSchema,
    fluxKontextMaxSchema
  ])
};

// Tool to generate images
server.registerTool("generate_image",
  {
    title: "Generate Image",
    description: "Generate an image using a FLUX model. By default waits for completion and returns the image URL. Set wait=false to return immediately with request ID.",
    inputSchema: generateImageSchema
  },
  async ({ params }) => {
    try {
      const { model, wait } = params;
      const endpoint = MODEL_ENDPOINTS[model];
      if (!endpoint) {
        return {
          content: [{ type: "text", text: `Invalid model: ${model}. Valid options: ${Object.keys(MODEL_ENDPOINTS).join(", ")}` }]
        };
      }

      // Build request body - spread params directly since Zod already validated them
      // Exclude 'model' and 'wait' which are not part of the API request
      const { model: _, wait: __, ...requestBody } = params;

      const initResponse = await makeBFLRequest(endpoint, requestBody);

      if (!wait) {
        return {
          content: [{ type: "text", text: `
Image generation request submitted.

Request ID: ${initResponse.id}
Model: ${model}

Use the bfl://requests/${initResponse.id} resource to check status.
`.trim() }]
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
          { type: "text", text: `
Image generated successfully!

Request ID: ${initResponse.id}
Model: ${model}
Image URL: ${result.result?.sample}
(Note: the image URL is only valid for 10 minutes.)

You can also use the bfl://images/${initResponse.id} resource to view the image directly.
`.trim() }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to generate image: ${error}` }]
      };
    }
  }
);

// Tool to download image to disk
server.registerTool("download_image",
  {
    title: "Download Image to Disk",
    description: "Download the image associated with a specific request ID to a file on disk",
    inputSchema: {
      request_id: z.string().describe("The request ID of the image generation"),
      file_path: z.string().describe("The file path where the image should be saved")
    }
  },
  async ({ request_id, file_path }) => {
    try {
      const result = await getResultById(request_id);

      if (result.status === "Error") {
        return {
          content: [{ type: "text", text: `Image generation failed: ${result.error}` }]
        };
      }

      if (result.status === "Pending") {
        return {
          content: [{ type: "text", text: `Image generation is still pending. Please wait for it to complete.` }]
        };
      }

      if (!result.result?.sample) {
        return {
          content: [{ type: "text", text: `No image URL found in result` }]
        };
      }

      // Fetch the image from the signed URL
      const imageResponse = await fetch(result.result.sample);

      if (!imageResponse.ok) {
        return {
          content: [{ type: "text", text: `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}` }]
        };
      }

      // Stream directly to file
      const fs = await import('fs');
      const { pipeline } = await import('stream/promises');
      const { Readable } = await import('stream');

      if (!imageResponse.body) {
        return {
          content: [{ type: "text", text: `No response body available` }]
        };
      }

      const writeStream = fs.createWriteStream(file_path);
      await pipeline(Readable.fromWeb(imageResponse.body as any), writeStream);

      return {
        content: [{ type: "text", text: `Image downloaded successfully to ${file_path}` }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to download image: ${error}` }]
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

// Resource to download the image associated with a request
server.registerResource("image", new ResourceTemplate("bfl://images/{requestId}", {
  list: undefined,
}),
  {
    title: "Image Download",
    description: "Download the image associated with a specific request",
  },
  async (uri, { requestId }) => {
    try {
      const result = await getResultById(requestId as string);

      if (result.status === "Error") {
        throw new Error(`Image generation failed: ${result.error}`);
      }

      if (result.status === "Pending") {
        throw new Error(`Image generation is still pending`);
      }

      if (!result.result?.sample) {
        throw new Error(`No image URL found in result`);
      }

      // Fetch the image from the signed URL
      const imageResponse = await fetch(result.result.sample);

      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
      }

      // Determine MIME type from Content-Type header
      let mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

      // Get the image as base64
      const imageBuffer = await imageResponse.arrayBuffer();
      const base64Image = Buffer.from(imageBuffer).toString('base64');

      return {
        contents: [{
          uri: uri.href,
          mimeType: mimeType,
          blob: base64Image
        }]
      };
    } catch (error) {
      throw new Error(`Failed to download image: ${error}`);
    }
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
