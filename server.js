// ==========================================================
// خادم بسيط له مهمتان:
// 1) استقبال ملف PDF من التطبيق واستخراج النص منه (/extract-text)
// 2) أخذ نص المادة وتوليد أسئلة اختبار عنه عبر Claude (/generate-questions)
// ==========================================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// multer يستقبل الملف المرفوع ويحطه مؤقتًا بالذاكرة
const upload = multer({ storage: multer.memoryStorage() });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ---------- Route رقم 1: استخراج النص من PDF ----------
app.post("/extract-text", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "لم يتم إرسال أي ملف" });
    }
    const data = await pdfParse(req.file.buffer);
    // نرجع النص المستخرج فقط، والتطبيق يخزنه محليًا
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

    // نقتطع النص إذا كان طويل جدًا (حماية بسيطة)
    const trimmedText = text.slice(0, 15000);

    const prompt = `فيما يلي نص مادة دراسية. أريدك أن تولّد ${count} أسئلة اختبارية متنوعة (اختيار من متعدد وأسئلة مقالية قصيرة) لاختبار فهم القارئ للمادة.

أجب فقط بصيغة JSON صالحة بدون أي نص إضافي، بهذا الشكل بالضبط:
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

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    // تنظيف الرد من أي فواصل markdown محتملة قبل تحويله JSON
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "فشل توليد الأسئلة" });
  }
});

app.get("/", (req, res) => {
  res.send("Study App Backend يعمل بنجاح ✅");
});

const PORT = process.env.PORT || 3000;
// نستمع على 0.0.0.0 عشان Replit يقدر يوصل للخادم من الخارج
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
