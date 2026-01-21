import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
import fs from "fs";

// Ensure uploads folder exists
fs.mkdirSync("uploads", { recursive: true });

const app = express();
app.use(cors());

const upload = multer({ dest: "uploads/" });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/estimate", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing photo" });
    }

    // Read uploaded image
    const imageBytes = fs.readFileSync(req.file.path);
    const base64 = imageBytes.toString("base64");

    // Call OpenAI Vision
    const resp = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Estimate calories and protein for the food in the photo. " +
                "Return ONLY valid JSON with keys: description, calories, protein_g. " +
                "calories and protein_g must be integers.",
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${base64}`,
            },
          ],
        },
      ],
    });

    const rawText = resp.output_text?.trim() || "";

    // ---- Robust JSON extraction ----
    function extractJson(text) {
      // Remove markdown code fences
      const noFences = text
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      // If pure JSON, return it
      if (noFences.startsWith("{") && noFences.endsWith("}")) {
        return noFences;
      }

      // Otherwise extract first {...} block
      const start = noFences.indexOf("{");
      const end = noFences.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        return noFences.slice(start, end + 1);
      }

      return noFences;
    }

    let parsed;
    try {
      parsed = JSON.parse(extractJson(rawText));
    } catch (e) {
      return res.status(500).json({
        error: "Model did not return JSON",
        raw: rawText,
      });
    }

    const out = {
      description: String(parsed.description || "Food"),
      calories: Math.round(Number(parsed.calories) || 0),
      protein_g: Math.round(Number(parsed.protein_g) || 0),
    };

    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Server error",
      details: String(err?.message || err),
    });
  } finally {
    // Clean up uploaded file
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
  }
});

app.listen(process.env.PORT || 8787, () => {
  console.log(`MacroCam server listening on ${process.env.PORT || 8787}`);
});
