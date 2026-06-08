/// <reference types="vite/client" />
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
const SYSTEM_PROMPT = `You are an AI assistant embedded in SOLIDCORE Dispatch,
a field service management platform for plumbing contractors.
Help dispatchers manage jobs, schedule technicians, and communicate with customers.
Be concise and practical.`;
export class GeminiService {
    constructor(apiKey) {
        this.provider = 'gemini';
        const key = apiKey ?? import.meta.env.VITE_GEMINI_API_KEY;
        if (!key)
            throw new Error('VITE_GEMINI_API_KEY is not set in your .env file.');
        this.client = new GoogleGenerativeAI(key);
    }
    async sendMessage(messages, context, options = {}) {
        const model = this.client.getGenerativeModel({
            model: 'gemini-2.0-flash',
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            ],
            generationConfig: {
                temperature: options.temperature ?? 0.7,
                maxOutputTokens: options.maxTokens ?? 1024,
            },
            systemInstruction: options.systemPrompt ?? this.buildSystemPrompt(context),
        });
        const history = messages
            .slice(0, -1)
            .filter(m => m.role !== 'system')
            .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));
        const chat = model.startChat({ history });
        const last = messages[messages.length - 1];
        const result = await chat.sendMessage(last.content);
        return result.response.text();
    }
    buildSystemPrompt(ctx) {
        const lines = [SYSTEM_PROMPT];
        if (ctx.currentPage)
            lines.push(`Current view: ${ctx.currentPage}.`);
        if (ctx.activeJobs !== undefined)
            lines.push(`Active jobs: ${ctx.activeJobs}.`);
        if (ctx.pendingDispatches !== undefined)
            lines.push(`Pending dispatches: ${ctx.pendingDispatches}.`);
        if (ctx.techsOnDuty?.length)
            lines.push(`Techs on duty: ${ctx.techsOnDuty.join(', ')}.`);
        if (ctx.selectedJob)
            lines.push(`Focused job: #${ctx.selectedJob.id} — ${ctx.selectedJob.customerName}, Phase: ${ctx.selectedJob.phase}, Tech: ${ctx.selectedJob.tech}.`);
        return lines.join('\n');
    }
}
