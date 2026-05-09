import express, { Router } from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const router = Router();

app.use(express.json({ limit: "50mb" }));

// Vision Model List Route
router.get("/models", async (req, res) => {
  const apiKey = process.env.GROK_API_KEY || (req.headers["x-api-key"] as string);

  if (!apiKey) {
    return res.status(401).json({ error: "Missing API Key" });
  }

  try {
    const response = await fetch("https://api.x.ai/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Captioning Route
router.post("/caption", async (req, res) => {
  const { image, mimeType, systemPrompt, model, temperature, detail, triggerWord } = req.body;
  const apiKey = process.env.GROK_API_KEY || (req.headers["x-api-key"] as string);

  if (!apiKey) {
    return res.status(401).json({ error: "Missing Grok API Key." });
  }

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "grok-4-1-fast",
        messages: [
          {
            role: "system",
            content: systemPrompt || "You are an expert image captioner for LoRA training.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Create a concise caption (15-35 words) for LoRA training. 
                
                CONTENT RULES:
                - Focus on: subject state, density/texture of hair, labia appearance/wetness, hand positions, angle, lighting, and realistic skin texture.
                - NEVER mention: watermarks, logos, signatures, text, tattoos, jewelry (rings/necklaces), or piercings.
                - IGNORE: background clutter (furniture, blankets) unless it is the primary subject.
                - AVOID: skin imperfections (freckles, moles, blemishes) and camera technicalities.
                - STYLE: Use direct, natural language. NO flowery or emotional adjectives.
                
                IMPORTANT: Start description immediately. The trigger word "${triggerWord || "my_subject"}" will be added by the system, so DO NOT include it in your output.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType || "image/jpeg"};base64,${image}`,
                  detail: detail || "high",
                },
              },
            ],
          },
        ],
        temperature: temperature || 0.7,
      }),
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      const text = await response.text();
      throw new Error(`Grok API returned non-JSON response (${response.status}): ${text.slice(0, 100)}`);
    }

    if (!response.ok) {
      const errorMessage = data.error?.message || data.message || `API Error ${response.status}`;
      throw new Error(errorMessage);
    }

    if (!data.choices?.[0]?.message?.content) {
      throw new Error("Grok API returned an unexpected response structure.");
    }

    res.json({ caption: data.choices[0].message.content });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Support both /api/models and /models when proxied
app.use("/api", router);
app.use("/", router);

export default app;
