export class DetectionService {
  constructor(apiKey, model = "gemini-2.5-flash") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async detectObjects(imageBlob, prompt, confidenceThreshold = 0.5) {
    const base64Image = await this.blobToBase64(imageBlob);
    const detection = await this.callLLM(base64Image, prompt);
    return {
      model: this.model,
      timestamp: new Date().toISOString(),
      features: detection.objects || [],
      metadata: {
        confidenceThreshold,
        promptUsed: prompt,
      },
    };
  }

  async callLLM(base64Image, prompt) {
    if (this.model.includes("gemini")) {
      return this.callGemini(base64Image, prompt);
    } else if (this.model.includes("claude")) {
      return this.callClaude(base64Image, prompt);
    }
    throw new Error(`Unsupported model: ${this.model}`);
  }

  async callGemini(base64Image, prompt) {
    const segmentationPrompt = `${prompt}

Output segmentation masks for detected objects. Return a JSON list where each object has:
- "label": the object type/label (e.g., "building", "road", "vegetation")
- "confidence": confidence score (0-1)
- "box_2d": [y0, x0, y1, x1] normalized coordinates (0-1000 scale)
- "mask": base64 encoded PNG segmentation mask (probability map 0-255)
- "id": unique identifier

The mask PNG should be a grayscale probability map where pixel values 0-255 represent confidence.
Return ONLY valid JSON, no markdown or extra text.`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: segmentationPrompt,
            },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    };
    const modelId = this.model.includes("pro")
      ? "gemini-2.5-pro"
      : "gemini-2.5-flash";
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );
    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        `Gemini API error: ${error.error?.message || response.statusText}`
      );
    }
    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new Error("No response from Gemini API");
    }
    try {
      const parsed = JSON.parse(content);
      return {
        objects: Array.isArray(parsed) ? parsed : parsed.objects || [],
      };
    } catch (err) {
      throw new Error(`Failed to parse Gemini response: ${err.message}`);
    }
  }

  async callClaude(base64Image, prompt) {
    throw new Error("Claude API integration not yet implemented");
  }

  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
