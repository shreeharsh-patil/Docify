import { NextRequest, NextResponse } from 'next/server';

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

async function callGroq(apiKey: string, action: string, text: string, options: Record<string, string | undefined>): Promise<string | null> {
  try {
    let systemPrompt: string;
    let userPrompt: string;

    if (action === 'summarize') {
      const detail = (options.length ?? 'brief') === 'detailed' ? 'detailed and comprehensive' : 'brief and concise';
      systemPrompt = `You are a document summarizer. Provide a ${detail} summary of the following document text. Include key points, main topics, and important details. Format in markdown.`;
      userPrompt = `Summarize the following document text:\n\n${text.substring(0, 15000)}`;
    } else if (action === 'translate') {
      const langMap: Record<string, string> = {
        Spanish: 'Spanish (Español)', French: 'French (Français)', German: 'German (Deutsch)',
        Chinese: 'Chinese (中文)', Hindi: 'Hindi (हिन्दी)', Japanese: 'Japanese (日本語)',
      };
      const lang = options.language ?? 'Spanish';
      const targetLang = langMap[lang] || lang;
      systemPrompt = `You are a professional translator. Translate the following text from English to ${targetLang}. Preserve the original meaning, tone, and formatting. Output the translation only.`;
      userPrompt = `Translate this document text to ${targetLang}:\n\n${text.substring(0, 15000)}`;
    } else {
      return null;
    }

    const res = await fetch(GROQ_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

async function callGemini(apiKey: string, action: string, text: string, options: Record<string, string | undefined>): Promise<string | null> {
  try {
    let prompt: string;
    if (action === 'summarize') {
      const detail = (options.length ?? 'brief') === 'detailed' ? 'detailed and comprehensive' : 'brief and concise';
      prompt = `You are a document summarizer. Provide a ${detail} summary of the following document text. Include key points, main topics, and important details. Format in markdown.\n\nDocument text:\n${text.substring(0, 15000)}`;
    } else if (action === 'translate') {
      const langMap: Record<string, string> = {
        Spanish: 'Spanish (Español)', French: 'French (Français)', German: 'German (Deutsch)',
        Chinese: 'Chinese (中文)', Hindi: 'Hindi (हिन्दी)', Japanese: 'Japanese (日本語)',
      };
      const lang = options.language ?? 'Spanish';
      const targetLang = langMap[lang] || lang;
      prompt = `You are a professional translator. Translate the following text from English to ${targetLang}. Preserve the original meaning, tone, and formatting. Output the translation only.\n\n${text.substring(0, 15000)}`;
    } else {
      return null;
    }

    const res = await fetch(`${GEMINI_API}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, text, language, length } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const options = { language, length };
    let content: string | null = null;

    // Try Groq first
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      content = await callGroq(groqKey, action, text, options);
    }

    // Fallback to Gemini
    if (!content) {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey) {
        content = await callGemini(geminiKey, action, text, options);
      }
    }

    if (!content) {
      return NextResponse.json(
        { error: 'No AI API keys configured. Set GROQ_API_KEY or GEMINI_API_KEY in .env.local' },
        { status: 400 }
      );
    }

    return NextResponse.json({ content });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'AI processing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
