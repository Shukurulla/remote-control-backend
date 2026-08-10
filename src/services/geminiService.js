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
async function generateComments(postDescription, count, tone, lang) {
  const toneMap = {
    positive: 'Postni qo\'llab-quvvatlash, yoqtirish, maqtash ruhida yoz.',
    negative: 'Postga salbiy/tanqidiy munosabat bildir. Lekin haqorat qilma, shunchaki rozi emasligini bildirsin.',
    neutral: 'Neytral munosabat bildir. Na maqtash, na tanqid — shunchaki fikr bildirish, savol berish, yoki oddiy reaksiya.',
  };
  const toneInstruction = toneMap[tone] || toneMap.positive;
  const langInfo = LANGUAGES[lang] || LANGUAGES.uz;

  const prompt = `Sen ijtimoiy tarmoqda oddiy foydalanuvchisan. Senga post haqida ta'rif beriladi. Sen shu post uchun ${count} ta bir-biridan BUTUNLAY farqli comment yozishing kerak.

MUHIM QOIDALAR:
1. Har bir comment 1-2 gapdan iborat bo'lsin, ba'zilari 3-5 so'zlik qisqa bo'lsin
2. ${toneInstruction}
3. TIL: ${langInfo.instruction}
4. Har bir comment uslubi boshqacha bo'lsin - ba'zilari emoji ishlatsin, ba'zilari ishlatmasin, ba'zilari qisqa, ba'zilari biroz uzunroq
5. SUNIY INTELLEKT EKANLIGI BILINMASIN! Buning uchun:
   - Ba'zi commentlarda ataylab 1-2 ta imloviy xato qil
   - Ba'zan so'z tartibini buzib yoz (xuddi tez yozgandek)
   - Ba'zan kichik harfda boshlash
   - Ba'zan tinish belgilarini qo'ymaslik
   - Hamma commentda xato qilma, ba'zilari to'g'ri yozilsin
6. Har bir commentni alohida qatorga yoz, boshqa hech narsa qo'shma (raqam, tire, nuqta qo'yma)

Post ta'rifi: ${postDescription}

Faqat ${count} ta comment yoz, har birini yangi qatorga:`;

  let result;
  try {
    result = await model.generateContent(prompt);
  } catch (err) {
    if (err.message && err.message.includes('429')) {
      throw new Error('Gemini API limiti tugadi. Bir oz kutib qayta urinib ko\'ring.');
    }
    throw err;
  }
  const text = result.response.text();

  const comments = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.match(/^\d+[\.\)]/));

  // Agar keragidan ko'p bo'lsa, kesib olamiz
  return comments.slice(0, count);
}

module.exports = { generateComments };
