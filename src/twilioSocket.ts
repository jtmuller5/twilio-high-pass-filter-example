import { IncomingMessage } from "http";
import WebSocket, { WebSocketServer } from "ws";
import { promises as fs } from "fs";

export interface TwilioSocket {
  ws: WebSocket;
  streamSid: string | null;
  callSid: string | null;
  host: string | null;
  phoneNumber: string | null;
  prevSampleIn?: number;
  prevSampleOut?: number;
  recordedSamplesUnfiltered?: Int16Array[];
  recordedSamplesFiltered?: Int16Array[];
}

export const twilioWss = new WebSocketServer({ noServer: true });

twilioWss.on("connection", async (ws: WebSocket, request: IncomingMessage) => {
  console.log("Twilio WebSocket connected");

  const host = request.headers.host;

  console.log(`Headers: ${JSON.stringify(request.headers)}`);

  const connection: TwilioSocket = {
    ws,
    streamSid: null,
    callSid: null,
    host: host || null,
    phoneNumber: null,
  };

  let chunkCounter = 0;

  ws.on("message", async (message: WebSocket.Data) => {
    if (message instanceof Buffer) {
      try {
        const jsonString = message.toString("utf8");
        const jsonMessage = JSON.parse(jsonString);

        if (!connection.streamSid && jsonMessage.streamSid) {
          connection.streamSid = jsonMessage.streamSid;
          console.log(`StreamSid set: ${connection.streamSid}`);
        }

        switch (jsonMessage.event) {
          case "connected":
            console.log("Twilio stream connected");
            console.log("Connected JSON: ", jsonMessage);
            break;

          case "start":
            /*
            {
                event: 'start',
                sequenceNumber: '1',
                start: {
                  accountSid: '1234',
                  streamSid: 'MZ14f465fb39b99eb0b0efd4bd5456cc8d',
                  callSid: '6789',
                  tracks: [ 'inbound' ],
                  mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 },
                  customParameters: { from: '+13152716606' }
                },
                streamSid: 'MZ14f465fb39b99eb0b0efd4bd5456cc8d'
            }
            */
            console.log("Twilio stream started: ", jsonMessage);
            break;

          case "media":
            /* 
                {
                "event":"media",
                "sequenceNumber":"3122",
                "media":
                  {
                    "track":"inbound",
                    "chunk":"3121",
                    "timestamp":"62411",
                    "payload":"////f39////////..."
                  },
                "streamSid":"MZe36496a19c2240a634016c64787ee984"
                }
            */
            // Now we should have connection.aiSocket
            if (jsonMessage.media && jsonMessage.media.payload) {
              chunkCounter++;
              await filterTwilioAudioAndSaveToWav(
                jsonMessage.media.payload,
                connection,
                chunkCounter
              );
            }
            break;

          case "stop":
            console.log("Twilio stream stopped");

            // If we have recorded audio, write them
            if (
              connection.recordedSamplesUnfiltered &&
              connection.recordedSamplesUnfiltered.length > 0
            ) {
              try {
                // Merge UNFILTERED
                const mergedUnfiltered = mergeInt16Arrays(
                  connection.recordedSamplesUnfiltered
                );
                const finalWavBufferUnfiltered = encodeWav(
                  mergedUnfiltered,
                  SAMPLE_RATE,
                  1
                );
                const unfilteredFilename = `twilio_call_unfiltered.wav`;
                await fs.writeFile(
                  unfilteredFilename,
                  finalWavBufferUnfiltered
                );
                console.log(`Wrote UNFILTERED WAV file: ${unfilteredFilename}`);

                // Merge FILTERED
                const mergedFiltered = mergeInt16Arrays(
                  connection.recordedSamplesFiltered || []
                );
                const finalWavBufferFiltered = encodeWav(
                  mergedFiltered,
                  SAMPLE_RATE,
                  1
                );
                const filteredFilename = `twilio_call_filtered.wav`;
                await fs.writeFile(filteredFilename, finalWavBufferFiltered);
                console.log(`Wrote FILTERED WAV file: ${filteredFilename}`);
              } catch (err) {
                console.error("Error writing final WAV files:", err);
              }
            }

            ws.close();
            break;

          default:
            console.log(`Unhandled event type: ${jsonMessage.event}`);
        }
      } catch (error) {
        console.error("Error processing Twilio message:", error);
      }
    } else {
      console.error("Received unexpected message type from Twilio");
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  ws.on("close", (code, reason) => {
    console.log(`WebSocket closed with code ${code}, reason: ${reason}`);
  });
});

function mergeInt16Arrays(chunks: Int16Array[]): Int16Array {
  // Calculate total length
  let totalLength = 0;
  for (let chunk of chunks) {
    totalLength += chunk.length;
  }

  // Create one big Int16Array
  const merged = new Int16Array(totalLength);

  // Copy each chunk in sequence
  let offset = 0;
  for (let chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

const SAMPLE_RATE = 8000;
const HP_CUTOFF = 300; // frequency in Hz

async function handleTwilioAudioWithFilter(
  audioPayload: string,
  connection: TwilioSocket
) {
  try {
    // 1) Base64-decode
    const muLawBuffer = Buffer.from(audioPayload, "base64");

    // 2) Decode µ-law -> Int16 PCM
    const samples = decodeMuLawBuffer(muLawBuffer);

    // 3) Apply the high-pass filter
    //    Initialize filter state if not done yet
    if (connection.prevSampleIn === undefined) {
      connection.prevSampleIn = 0;
      connection.prevSampleOut = 0;
    }
    const alpha = computeAlpha(HP_CUTOFF, SAMPLE_RATE);
    const { filtered, newPrevIn, newPrevOut } = highPassFilter(
      samples,
      alpha,
      connection.prevSampleIn,
      connection.prevSampleOut!
    );
    connection.prevSampleIn = newPrevIn;
    connection.prevSampleOut = newPrevOut;

    // 4) Re-encode the filtered PCM to µ-law
    const reencodedMuLawBuf = encodeMuLawBuffer(filtered);

    // 5) Base64-encode for your AI socket
    const reencodedBase64 = reencodedMuLawBuf.toString("base64");
  } catch (error) {
    console.error("Error handling Twilio audio:", error);
  }
}

async function filterTwilioAudioAndSaveToWav(
  audioPayload: string,
  connection: TwilioSocket,
  chunkNumber: number
) {
  try {
    // 1) Base64-decode
    const muLawBuffer = Buffer.from(audioPayload, "base64");

    // 2) Decode µ-law -> Int16 PCM
    const pcmSamples = decodeMuLawBuffer(muLawBuffer);

    // -- Always store the raw/unfiltered version
    if (!connection.recordedSamplesUnfiltered) {
      connection.recordedSamplesUnfiltered = [];
    }
    connection.recordedSamplesUnfiltered.push(pcmSamples);

    // -- Now apply the high-pass filter
    if (connection.prevSampleIn === undefined) {
      connection.prevSampleIn = 0;
    }
    if (connection.prevSampleOut === undefined) {
      connection.prevSampleOut = 0;
    }

    const alpha = computeAlpha(HP_CUTOFF, SAMPLE_RATE);
    const { filtered, newPrevIn, newPrevOut } = highPassFilter(
      pcmSamples,
      alpha,
      connection.prevSampleIn,
      connection.prevSampleOut
    );
    connection.prevSampleIn = newPrevIn;
    connection.prevSampleOut = newPrevOut;

    // -- Store the filtered version
    if (!connection.recordedSamplesFiltered) {
      connection.recordedSamplesFiltered = [];
    }
    connection.recordedSamplesFiltered.push(filtered);

    console.log(
      `Stored chunk #${chunkNumber} - raw length=${pcmSamples.length}, filtered length=${filtered.length}.`
    );
  } catch (err) {
    console.error("Error filtering + storing WAV data:", err);
  }
}

/**
 * Wrap PCM samples in a standard 44-byte WAV header (mono, 16-bit, 8000Hz).
 * Returns a Buffer containing the entire WAV file (header + samples).
 */
function encodeWav(
  samples: Int16Array,
  sampleRate: number,
  numChannels: number
): Buffer {
  const bitsPerSample = 16;
  // Byte length of the PCM data
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataByteLength = samples.length * 2; // 2 bytes per sample (16-bit)
  // WAV header size = 44 bytes
  // overall file size = 44 + dataByteLength - 8 for chunk size
  const fileSize = 44 + dataByteLength;

  // Allocate buffer for header + PCM samples
  // 44 bytes (header) + dataByteLength
  const wavBuffer = Buffer.alloc(fileSize);

  // RIFF chunk descriptor
  wavBuffer.write("RIFF", 0); // ChunkID
  wavBuffer.writeUInt32LE(fileSize - 8, 4); // ChunkSize = fileSize - 8
  wavBuffer.write("WAVE", 8); // Format

  // 'fmt ' sub-chunk
  wavBuffer.write("fmt ", 12); // Subchunk1ID
  wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  wavBuffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  wavBuffer.writeUInt16LE(numChannels, 22); // NumChannels
  wavBuffer.writeUInt32LE(sampleRate, 24); // SampleRate
  wavBuffer.writeUInt32LE(byteRate, 28); // ByteRate
  wavBuffer.writeUInt16LE(blockAlign, 32); // BlockAlign
  wavBuffer.writeUInt16LE(bitsPerSample, 34); // BitsPerSample

  // 'data' sub-chunk
  wavBuffer.write("data", 36); // Subchunk2ID
  wavBuffer.writeUInt32LE(dataByteLength, 40); // Subchunk2Size

  // Write PCM samples (little-endian)
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    wavBuffer.writeInt16LE(samples[i], offset);
    offset += 2;
  }

  return wavBuffer;
}

// Minimal reuse of single-pole filter logic
function computeAlpha(cutoff: number, sampleRate: number): number {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / sampleRate;
  return rc / (rc + dt);
}

function highPassFilter(
  samples: Int16Array,
  alpha: number,
  prevSampleIn: number,
  prevSampleOut: number
): { filtered: Int16Array; newPrevIn: number; newPrevOut: number } {
  const filtered = new Int16Array(samples.length);
  let pIn = prevSampleIn;
  let pOut = prevSampleOut;

  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = alpha * (pOut + x - pIn);
    filtered[i] = y; // truncated to 16-bit
    pIn = x;
    pOut = y;
  }

  return { filtered, newPrevIn: pIn, newPrevOut: pOut };
}

// mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 },
function muLawDecode(uVal: number): number {
  // Flip bits
  uVal = ~uVal & 0xff;

  const sign = uVal & 0x80 ? -1 : 1;
  let exponent = (uVal >> 4) & 0x07;
  let mantissa = uVal & 0x0f;
  let magnitude = (mantissa << 4) + 0x08;

  if (exponent > 0) {
    magnitude += 0x100;
  }
  if (exponent > 1) {
    magnitude <<= exponent - 1;
  }
  return sign * magnitude;
}

function decodeMuLawBuffer(muLawBuffer: Buffer): Int16Array {
  const out = new Int16Array(muLawBuffer.length);
  for (let i = 0; i < muLawBuffer.length; i++) {
    out[i] = muLawDecode(muLawBuffer[i]);
  }
  return out;
}

/**
 * Encodes one 16-bit PCM sample → 8-bit µ-law sample.
 * Clamps sample to [-32768..32767].
 */
function muLawEncode(sample: number): number {
  // Clamp
  if (sample > 32767) sample = 32767;
  if (sample < -32768) sample = -32768;

  // Get sign bit
  const sign = sample < 0 ? 0x80 : 0x00;
  if (sign) sample = -sample;

  // µ-law uses a logarithmic segment approach.
  // We'll find the "exponent" by finding how many times we can shift right
  // before the value falls under 128.
  let exponent = 0;
  let magnitude = sample >> 2; // The bias in µ-law is effectively 4, so shift by 2
  while (magnitude > 0x3f) {
    magnitude >>= 1;
    exponent++;
  }

  // The mantissa is the lower 6 bits
  const mantissa = magnitude & 0x3f;

  const ulawByte = ~(sign | (exponent << 4) | (mantissa & 0x0f)) & 0xff;
  return ulawByte;
}

/**
 * Encodes an Int16Array of PCM → a Buffer of 8-bit µ-law bytes.
 */
function encodeMuLawBuffer(pcmSamples: Int16Array): Buffer {
  const out = Buffer.alloc(pcmSamples.length);
  for (let i = 0; i < pcmSamples.length; i++) {
    out[i] = muLawEncode(pcmSamples[i]);
  }
  return out;
}
