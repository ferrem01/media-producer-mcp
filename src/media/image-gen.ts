import fs from "node:fs/promises";
import path from "node:path";

export interface ImageGenOptions {
  prompt: string;
  model?: "gpt-image-1" | "dall-e-3" | "dall-e-2";
  size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
  quality?: "low" | "medium" | "high" | "auto";
  style?: "natural" | "vivid";
  outputPath: string;
  apiKey?: string;
}

export interface ImageGenResult {
  path: string;
  width: number;
  height: number;
  revised_prompt?: string;
}

export async function generateImage(opts: ImageGenOptions): Promise<ImageGenResult> {
  const apiKey = opts.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY required for image generation");

  const model = opts.model || "gpt-image-1";
  const size = opts.size || "1536x1024"; // landscape default for video scenes
  const quality = opts.quality || "high";

  console.log(`  Image gen: "${opts.prompt.substring(0, 60)}..." model=${model} size=${size}`);

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: opts.prompt,
      n: 1,
      size,
      quality,
      ...(model !== "gpt-image-1" ? { response_format: "b64_json" } : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "unknown");
    throw new Error(`OpenAI Image API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const b64 = data.data[0].b64_json;
  const revisedPrompt = data.data[0].revised_prompt;

  if (!b64) {
    // If no b64_json (e.g. URL response), try downloading from URL
    const imageUrl = data.data[0].url;
    if (imageUrl) {
      const imgResp = await fetch(imageUrl);
      if (!imgResp.ok) throw new Error("Failed to download generated image from URL");
      const imgBuf = Buffer.from(await imgResp.arrayBuffer());
      await fs.mkdir(path.dirname(opts.outputPath), { recursive: true });
      await fs.writeFile(opts.outputPath, imgBuf);
      const [w, h] = size === "auto" ? [1024, 1024] : size.split("x").map(Number);
      console.log(`  Image gen: saved ${(imgBuf.length / 1024).toFixed(0)}KB to ${opts.outputPath}`);
      return { path: opts.outputPath, width: w, height: h, revised_prompt: revisedPrompt };
    }
    throw new Error("No image data in response");
  }

  await fs.mkdir(path.dirname(opts.outputPath), { recursive: true });
  await fs.writeFile(opts.outputPath, Buffer.from(b64, "base64"));

  const [w, h] = size === "auto" ? [1024, 1024] : size.split("x").map(Number);
  const fileSize = (Buffer.from(b64, "base64").length / 1024).toFixed(0);
  console.log(`  Image gen: saved ${fileSize}KB to ${opts.outputPath}`);

  return { path: opts.outputPath, width: w, height: h, revised_prompt: revisedPrompt };
}
