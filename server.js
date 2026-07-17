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
    if (!req.file) {
      return res.status(400).json({ error: "لم يتم إرسال أي ملف" });
    }
    const data = await pdfParse(req.file.buffer);
    res.json({ text: data.text, pages: data.numpages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "فشل استخراج النص من الملف" });
  }
});

// ---------- Route رقم 2: توليد أسئلة عن المادة ----------
app.post("/generate-questions", async (req, res) => {
  try {
    const { text, count = 5 } = req.body;
    if (!text || text.trim().length < 20) {
      return res.status(400).json({ error: "النص قصير جدًا لتوليد أسئلة" });
    }

    const trimmedText = text.slice(0, 15000);

    const prompt = `فيما يلي نص مادة دراسية. أريدك أن تولّد ${count} أسئلة اختبارية متنوعة (اختيار من متعدد وأسئلة مقالية قصيرة) لاختبار فهم القارئ للمادة.

أجب فقط بصيغة JSON صالحة ومطابقة لهذا الهيكل تماماً وبدون أي ماركداون:
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

    // تهيئة العميل هنا بشكل حي ومباشر لضمان قراءة المفتاح من بيئة Railway السحابية
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "API key is missing in environment variables" });
    }
    
    const ai = new GoogleGenerativeAI(apiKey);

    const model = ai.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();

    const parsed = JSON.parse(rawText.trim());
    res.json(parsed);

  } catch (err) {
    console.error("Gemini Error:", err);
    res.status(500).json({ error: "فشل توليد الأسئلة" });
  }
});

app.get("/", (req, res) => {
  res.send("Study App Backend يعمل بنجاح ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
