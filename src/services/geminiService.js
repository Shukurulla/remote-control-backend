const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const LANGUAGES = {
  uz: { name: "O'zbek tili", instruction: "Commentlarni O'ZBEK tilida yoz. Lotin alifbosida." },
  qq: { name: "Qaraqalpoq tili", instruction: "Commentlarni QARAQALPOQ tilida yoz. Lotin alifbosida." },
  kz: { name: "Qozoq tili", instruction: "Commentlarni QOZOQ tilida yoz. Kirill alifbosida." },
  ru: { name: "Rus tili", instruction: "Commentlarni RUS tilida yoz. Kirill alifbosida." },
};

/**
 * Har bir qurilma uchun noyob, tabiiy comment generatsiya qiladi
 * @param {string} postDescription - Post haqida ta'rif (foydalanuvchi yozadi)
 * @param {number} count - Nechta comment kerak
 * @param {string} tone - "positive", "negative" yoki "neutral"
 * @param {string} lang - "uz", "qq", "kz", "ru"
 * @returns {Promise<string[]>} - Commentlar massivi
 */
// So'z filtri — Gemini xavfsizlik qoidalarini buzsa ham, so'nggi qatlam.
// Bu ro'yxatda hech bo'lmasa bitta so'z bo'lsa, comment butunlay tashlab yuboriladi.
const BANNED_PATTERNS = [
  // Uz — haqorat, kamsitish
  /\b(ahmoq|tentak|jinni|mayxo\?r|nodon|kaltafahm|itdek|it bola|kal|so\?tak|ablah|jallob|xoin|farroshdek)\b/i,
  // Ru — grubie / oskorbleniya
  /\b(идиот|дурак|тупой|тупица|дебил|мразь|урод|сволочь|скотина|подонок|быдло|шлюха|ублюдок)\b/i,
  // En
  /\b(idiot|stupid|retard|moron|loser|garbage|trash|kill yourself|kys|hate you|bitch|asshole|bastard)\b/i,
  // Nafrat/adovat markerlari
  /\b(o\?l|jahannamga|do\?zaxga|umid uzasan|yer yut|подохни|сдохни|die|go die)\b/i,
];

function isSafeComment(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim();
  if (!clean) return false;
  return !BANNED_PATTERNS.some((rx) => rx.test(clean));
}

async function generateComments(postDescription, count, tone, lang) {
  const toneMap = {
    positive: 'Postni qo\'llab-quvvatlash, yoqtirish, hurmat bilan maqtash ruhida yoz.',
    negative:
      'Postga rozi emasligingni MADANIY, XUSHMUOMALA tarzda bildir. Faqat fikringni asoslab ayt, hech qanday shakldagi haqorat, kamsitish, shaxsiy hujum ishlatma.',
    neutral:
      'Neytral munosabat bildir. Na maqtash, na tanqid — shunchaki fikr, savol yoki oddiy reaksiya. Hurmat doirasida.',
  };
  const toneInstruction = toneMap[tone] || toneMap.positive;
  const langInfo = LANGUAGES[lang] || LANGUAGES.uz;

  const prompt = `Sen ijtimoiy tarmoqda oddiy, madaniyatli foydalanuvchisan. Senga post haqida ta'rif beriladi. Sen shu post uchun ${count} ta bir-biridan BUTUNLAY farqli comment yozishing kerak.

╔══════════════════════════════════════════════════════════╗
║  MUTLAQ TAQIQLANGAN — HECH QACHON YOZMA:                ║
╠══════════════════════════════════════════════════════════╣
║  ✘ Har qanday HAQORAT, so'kish, kamsituvchi so'zlar     ║
║  ✘ Insonni yoki guruhni pastga urish, mazax qilish     ║
║  ✘ Nafrat, adovat, milliy/diniy/irqiy dushmanlik       ║
║  ✘ G'azab qo'zg'ovchi, provokatsion iboralar            ║
║  ✘ Zo'ravonlik, tahdid, o'lim yoki zarar tilash        ║
║  ✘ Shaxsiyatga hujum ("o'zing kimsan", "aqling yo'q")  ║
║  ✘ Jinsiy, uyat yoki qo'pol tarkib                      ║
║  ✘ Siyosiy provokatsiya, hukumatga qarshi da'vat       ║
║  ✘ Mualliflik huquqi buzilishi, do'q, majburlash        ║
║  ✘ Odamning tashqi ko'rinishi/tanasini kamsitish       ║
║                                                          ║
║  Hatto "negative" tonda ham — faqat MADANIY tanqid.    ║
║  Fikringga qo'shilmaslik = HURMAT bilan ayt.           ║
╚══════════════════════════════════════════════════════════╝

Bu qoidalarni buzsang natijang butunlay bekor qilinadi.

BOSHQA QOIDALAR:
1. Har bir comment 1-2 gapdan iborat bo'lsin, ba'zilari 3-5 so'zlik qisqa bo'lsin
2. ${toneInstruction}
3. TIL: ${langInfo.instruction}
4. Har bir comment uslubi boshqacha bo'lsin — ba'zilari emoji ishlatsin, ba'zilari ishlatmasin, ba'zilari qisqa, ba'zilari biroz uzunroq
5. SUNIY INTELLEKT EKANLIGI BILINMASIN:
   - Ba'zi commentlarda ataylab 1-2 ta imloviy xato qil
   - Ba'zan so'z tartibini buzib yoz (xuddi tez yozgandek)
   - Ba'zan kichik harfda boshlash
   - Ba'zan tinish belgilarini qo'ymaslik
   - Hamma commentda xato qilma, ba'zilari to'g'ri yozilsin
6. Har bir commentni alohida qatorga yoz, boshqa hech narsa qo'shma (raqam, tire, nuqta qo'yma)

Post ta'rifi: ${postDescription}

Faqat ${count} ta comment yoz, har birini yangi qatorga:`;

  // Gemini xavfsizlik sozlamalari — modelning o'zi ham zararli tarkibni bloklaydi
  const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  ];

  let result;
  try {
    result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      safetySettings,
    });
  } catch (err) {
    if (err.message && err.message.includes('429')) {
      throw new Error('Gemini API limiti tugadi. Bir oz kutib qayta urinib ko\'ring.');
    }
    throw err;
  }
  const text = result.response.text();

  const rawLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.match(/^\d+[\.\)]/));

  // Xavfsiz emas commentlarni saralash — regex filter oxirgi qatlam sifatida
  const safe = rawLines.filter(isSafeComment);
  const rejected = rawLines.length - safe.length;
  if (rejected > 0) {
    console.warn(`⚠️ ${rejected} ta comment xavfsizlik filtrida to'silandi`);
  }

  if (safe.length < count) {
    // Yetarli emas — qolgan uchun neytral fallback
    const fallback = [
      'Zo\'r ekan 👍',
      'Yaxshi post',
      'Ajoyib!',
      'Rahmat ma\'lumot uchun',
      'Manam shu fikrdaman',
    ];
    while (safe.length < count) {
      safe.push(fallback[safe.length % fallback.length]);
    }
  }

  return safe.slice(0, count);
}

module.exports = { generateComments };
