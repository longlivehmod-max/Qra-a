require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({ storage: multer.memoryStorage() });

// ---------- Route رقم 1: استخراج النص من PDF ----------
app.post("/extract-text", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "لم يتم إرسال أي ملف" });
    const data = await pdfParse(req.file.buffer);
    res.json({ text: data.text, pages: data.numpages });
  } catch (err) {
    console.error("حدث خطأ أثناء استخراج النص:", err);
    res.status(500).json({ error: "فشل استخراج النص" });
  }
});

// ---------- Route رقم 2: توليد أسئلة مخصصة عن المادة ----------
app.post("/generate-questions", async (req, res) => {
  try {
    // 🌟 استقبال نص المادة، العدد المطلوب، ونوع الأسئلة من تطبيق الموبايل
    const { text, count = 5, questionType = "mixed" } = req.body;
    
    console.log(`--- طلب جديد | العدد: ${count} | النوع: ${questionType} | طول النص: ${text ? text.length : 0} حرف ---`);

    if (!text || text.trim().length < 20) {
      return res.status(400).json({ error: "النص قصير جدًا لتوليد أسئلة" });
    }

    const trimmedText = text.slice(0, 15000);
    const apiKey = process.env.GEMINI_API_KEY;
    const ai = new GoogleGenerativeAI(apiKey);

    const model = ai.getGenerativeModel({ 
      model: "gemini-2.0-flash", 
      generationConfig: { responseMimeType: "application/json" }
    });

    // 🌟 صياغة ديناميكية للبرومبت بناءً على نوع الأسئلة المختار
    let typeInstruction = "متنوعة (اختيار من متعدد وأسئلة مقالية قصيرة)";
    if (questionType === "mcq") {
      typeInstruction = "خيار من متعدد (Multiple Choice) فقط";
    } else if (questionType === "essay") {
      typeInstruction = "مقالية قصيرة (Short Answer) فقط";
    }

    const prompt = `فيما يلي نص مادة دراسية. أريدك أن تولّد ${count} أسئلة اختبارية تكون من نوع: ${typeInstruction}، لاختبار فهم القارئ للمادة بشكل دقيق.

أجب فقط بصيغة JSON صالحة ومطابقة لهذا الهيكل تماماً وبدون أي ماركداون أو مقدمات:
{
  "questions": [
    {
      "type": "multiple_choice",
      "question": "نص السؤال",
      "options": ["خيار 1", "خيار 2", "خيار 3", "خيار 4"],
      "correctAnswer": "الخيار الصحيح"
    },
    {
      "type": "short_answer",
      "question": "نص السؤال",
      "correctAnswer": "الإجابة النموذجية"
    }
  ]
}

نص المادة:
${trimmedText}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();

    res.json(JSON.parse(rawText.trim()));

  } catch (err) {
    console.error("🛑 خطأ صريح من جـوجـل جـمـيـنـاي:", err.message || err);
    res.status(500).json({ error: "فشل توليد الأسئلة" });
  }
});

app.get("/", (req, res) => res.send("Backend Online ✅"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
