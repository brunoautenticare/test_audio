import express, { type Request, type Response } from 'express';
import * as dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import mime from 'mime';

dotenv.config();

const app = express();
app.use(express.json());
const port = process.env.PORT || 8080;

interface WavConversionOptions {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}

function parseMimeType(mimeType: string) {
  const [fileType, ...params] = mimeType.split(';').map((s) => s.trim());
  const [_, format] = fileType.split('/');

  const options: Partial<WavConversionOptions> = {
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

  return options as WavConversionOptions;
}

function createWavHeader(dataLength: number, options: WavConversionOptions) {
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

function convertToWav(rawData: string, mimeType: string) {
    const options = parseMimeType(mimeType);
    const rawBuffer = Buffer.from(rawData, 'base64');
    const header = createWavHeader(rawBuffer.length, options);
    return Buffer.concat([header, rawBuffer]);
}

async function generateAudioStream(textToSpeak: string): Promise<Buffer> {
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    
    // CORREÇÃO APLICADA AQUI
    const config = {
        temperature: 1,
        responseModalities: [
            'audio',
        ],
    };

    const model = 'gemini-2.5-pro-preview-tts';
    const contents = [
        {
            role: 'user',
            parts: [
                { text: textToSpeak },
            ],
        },
    ];

    const generativeModel = ai.getGenerativeModel({ model });
    const responseStream = await generativeModel.generateContentStream({
        contents,
        generationConfig: config,
    });

    const audioChunks: Buffer[] = [];
    let audioMimeType = '';

    for await (const chunk of responseStream.stream) {
        if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
            const inlineData = chunk.candidates[0].content.parts[0].inlineData;
            if (!audioMimeType && inlineData.mimeType) {
                audioMimeType = inlineData.mimeType;
            }
            const audioChunkBuffer = Buffer.from(inlineData.data, 'base64');
            audioChunks.push(audioChunkBuffer);
        }
    }

    if (audioChunks.length === 0) {
        throw new Error("Nenhum dado de áudio foi recebido da API do Gemini.");
    }
    
    const combinedBuffer = Buffer.concat(audioChunks);
    const combinedBase64 = combinedBuffer.toString('base64');
    
    const finalWavBuffer = convertToWav(combinedBase64, audioMimeType);

    return finalWavBuffer;
}

app.post('/generate-audio', async (req: Request, res: Response) => {
    const { text } = req.body;

    if (!text) {
        return res.status(400).send({ error: 'O campo "text" é obrigatório no corpo da requisição.' });
    }

    try {
        console.log(`Gerando áudio para o texto: "${text}"`);
        const audioBuffer = await generateAudioStream(text);

        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Disposition', 'attachment; filename=audio.wav');
        
        res.send(audioBuffer);
        console.log('Áudio enviado com sucesso!');

    } catch (error) {
        console.error('Erro ao gerar áudio:', error);
        res.status(500).send({ error: 'Falha ao gerar o áudio.' });
    }
});

app.get('/', (req: Request, res: Response) => {
    res.send('API de Text-to-Speech está no ar! Use o endpoint POST /generate-audio.');
});

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});