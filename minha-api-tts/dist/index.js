"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv = __importStar(require("dotenv"));
const generative_ai_1 = require("@google/generative-ai");
const cors_1 = __importDefault(require("cors"));
dotenv.config();
const app = (0, express_1.default)();
const allowedOrigins = [
    'https://autenticarewebsite.web.app',
    'https://autenticarewebsite.firebaseapp.com'
];
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    }
};
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
const port = process.env.PORT || 8080;
function parseMimeType(mimeType) {
    const [fileType, ...params] = mimeType.split(';').map((s) => s.trim());
    const [_, format] = fileType.split('/');
    const options = {
        numChannels: 1,
    };
    if (format && format.startsWith('L')) {
        const bits = parseInt(format.slice(1), 10);
        if (!isNaN(bits)) {
            options.bitsPerSample = bits;
        }
    }
    for (const param of params) {
        const [key, value] = param.split('=').map((s) => s.trim());
        if (key === 'rate') {
            options.sampleRate = parseInt(value, 10);
        }
    }
    return options;
}
function createWavHeader(dataLength, options) {
    const { numChannels, sampleRate, bitsPerSample } = options;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const buffer = Buffer.alloc(44);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    return buffer;
}
function convertToWav(rawData, mimeType) {
    const options = parseMimeType(mimeType);
    const rawBuffer = Buffer.from(rawData, 'base64');
    const header = createWavHeader(rawBuffer.length, options);
    return Buffer.concat([header, rawBuffer]);
}
async function generateAudio(textToSpeak, voiceName) {
    const ai = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const config = {
        temperature: 1,
        responseModalities: ['audio'],
        speechConfig: {
            voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName },
            },
        },
    };
    const model = 'gemini-2.5-pro-preview-tts';
    const contents = [{ role: 'user', parts: [{ text: textToSpeak }] }];
    const generativeModel = ai.getGenerativeModel({ model });
    const responseStream = await generativeModel.generateContentStream({ contents, generationConfig: config });
    const audioChunks = [];
    let audioMimeType = '';
    for await (const chunk of responseStream.stream) {
        if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
            const inlineData = chunk.candidates[0].content.parts[0].inlineData;
            if (!audioMimeType)
                audioMimeType = inlineData.mimeType;
            audioChunks.push(Buffer.from(inlineData.data, 'base64'));
        }
    }
    if (audioChunks.length === 0)
        throw new Error("Nenhum áudio recebido.");
    return convertToWav(Buffer.concat(audioChunks).toString('base64'), audioMimeType);
}
async function generatePodcast(dialogue, voiceName1, voiceName2) {
    const ai = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const config = {
        temperature: 1,
        responseModalities: ['audio'],
        speechConfig: {
            multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                    { speaker: 'Speaker 1', voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName1 } } },
                    { speaker: 'Speaker 2', voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName2 } } },
                ]
            },
        },
    };
    const model = 'gemini-2.5-pro-preview-tts';
    const contents = [{ role: 'user', parts: [{ text: dialogue }] }];
    const generativeModel = ai.getGenerativeModel({ model });
    const responseStream = await generativeModel.generateContentStream({ contents, generationConfig: config });
    const audioChunks = [];
    let audioMimeType = '';
    for await (const chunk of responseStream.stream) {
        if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
            const inlineData = chunk.candidates[0].content.parts[0].inlineData;
            if (!audioMimeType)
                audioMimeType = inlineData.mimeType;
            audioChunks.push(Buffer.from(inlineData.data, 'base64'));
        }
    }
    if (audioChunks.length === 0)
        throw new Error("Nenhum áudio recebido.");
    return convertToWav(Buffer.concat(audioChunks).toString('base64'), audioMimeType);
}
app.post('/generate-audio', async (req, res) => {
    const { text, voice } = req.body;
    if (!text)
        return res.status(400).send({ error: 'O campo "text" é obrigatório.' });
    const voiceName = voice || 'Zephyr';
    console.log(`Gerando áudio para: "${text}" com a voz: "${voiceName}"`);
    try {
        const audioBuffer = await generateAudio(text, voiceName);
        res.setHeader('Content-Type', 'audio/wav').send(audioBuffer);
        console.log('Áudio enviado com sucesso!');
    }
    catch (error) {
        console.error('Erro ao gerar áudio:', error);
        res.status(500).send({ error: 'Falha ao gerar o áudio.' });
    }
});
app.post('/generate-podcast', async (req, res) => {
    const { text, voice1, voice2 } = req.body;
    if (!text || !voice1 || !voice2) {
        return res.status(400).send({ error: 'Os campos "text", "voice1" e "voice2" são obrigatórios.' });
    }
    console.log(`Gerando podcast para: "${text}" com as vozes: "${voice1}" e "${voice2}"`);
    try {
        const audioBuffer = await generatePodcast(text, voice1, voice2);
        res.setHeader('Content-Type', 'audio/wav').send(audioBuffer);
        console.log('Podcast enviado com sucesso!');
    }
    catch (error) {
        console.error('Erro ao gerar podcast:', error);
        res.status(500).send({ error: 'Falha ao gerar o podcast.' });
    }
});
app.get('/', (req, res) => {
    res.send('API está no ar!');
});
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
