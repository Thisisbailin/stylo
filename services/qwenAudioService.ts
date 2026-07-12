import { fetchViaProxy } from "../utils/api";
import { encodeWebSocketCredential } from "../utils/websocketAuth";

export type QwenAudioOptions = {
    apiKey?: string;
    model?: string;
    voice?: string;       // Built-in voice name or Generated Voice ID
    voicePrompt?: string; // Natural language description for VOICE DESIGN
    instruction?: string; // Natural language instruction for EXPRESSIVE DUBBING (e.g. "Speak sadly")
    format?: 'wav' | 'mp3' | 'pcm';
    sampleRate?: number;
    volume?: number;
    speechRate?: number;
    pitch?: number;
};

const TTS_BASE = "https://dashscope.aliyuncs.com";
const CUSTOMIZE_BASE = `${TTS_BASE}/api/v1/services/audio/tts/customization`;
const GENERATE_BASE = `${TTS_BASE}/api/v1/services/audio/tts/generation`;

const resolveApiKey = (configuredKey?: string) => {
    const key = (configuredKey || "").trim();
    if (!key) throw new Error("Missing Qwen API key. 请在项目设置中填写。");
    return key;
};

const sanitizePreferredName = (name?: string): string | undefined => {
    if (!name) return undefined;
    // API rules: only alphanumeric and underscores, max 16 characters
    let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_');
    // If it started with numbers/etc but now empty or just underscores, handle fallback
    sanitized = sanitized.replace(/^_+|_+$/g, '');
    if (!sanitized) sanitized = "voice";
    return sanitized.slice(0, 16);
};

/**
 * Voice Design: Create a unique, fixed voice ID for a character
 */
export const createCustomVoice = async (params: {
    apiKey?: string;
    voicePrompt: string;
    previewText?: string;
    preferredName?: string;
    language?: 'zh' | 'en' | 'ja' | 'ko' | 'vi';
}) => {
    const apiKey = resolveApiKey(params.apiKey);
    const body = {
        model: "qwen-voice-design",
        input: {
            action: "create",
            target_model: "qwen3-tts-vd-realtime-2025-12-16", // Mandatory target model
            voice_prompt: params.voicePrompt.slice(0, 2000), // Constraint: 2048
            preview_text: (params.previewText || "您好，这是为您定制的专属音色。").slice(0, 1000), // Constraint: 1024
            preferred_name: sanitizePreferredName(params.preferredName),
            language: params.language || "zh"
        },
        parameters: {
            sample_rate: 24000,
            response_format: "wav"
        }
    };

    const res = await fetchViaProxy(CUSTOMIZE_BASE, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Voice Design failed (${res.status}): ${errText}`);
    }

    const result = await res.json();
    const voiceId = result.output.voice;
    const base64Audio = result.output.preview_audio?.data;

    let previewAudioUrl = "";
    if (base64Audio) {
        const byteCharacters = atob(base64Audio);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'audio/wav' });
        previewAudioUrl = URL.createObjectURL(blob);
    }

    return {
        voiceId,
        previewAudioUrl,
        previewAudioBase64: base64Audio, // Keep the raw data for persistence/download
        raw: result
    };
};

/**
 * Qwen3-TTS Service
 * Refined for "Smart Persona Design" and "Atmospheric Dubbing".
 */
const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

/**
 * Qwen3-TTS Service
 * Refined for "Smart Persona Design" and "Atmospheric Dubbing".
 */
export const generateSpeech = async (
    text: string,
    options?: QwenAudioOptions
): Promise<{ audioUrl: string; duration?: number; raw: any }> => {
    const apiKey = resolveApiKey(options?.apiKey);

    let model = options?.model;
    const isDesignedVoice = options?.voice?.startsWith('vd-') || options?.voice?.includes('vd-');

    if (isDesignedVoice) {
        model = "qwen3-tts-vd-realtime-2025-12-16";
    } else if (!model) {
        if (options?.voicePrompt) {
            model = "qwen3-tts-vd-flash";
        } else {
            model = "qwen3-tts-flash";
        }
    }

    // === WebSocket Implementation for Designed Voices (Realtime Model) ===
    if (model === "qwen3-tts-vd-realtime-2025-12-16") {
        return new Promise((resolve, reject) => {
            // Browser WebSocket APIs cannot set Authorization. Carry the BYOK credential
            // in a private subprotocol so it never appears in URLs or access logs.
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/api/qwen-tts-ws/v1/realtime?model=${encodeURIComponent(
                model
            )}`;

            const ws = new WebSocket(wsUrl, [encodeWebSocketCredential(apiKey)]);
            const taskId = generateUUID();
            const audioChunks: Uint8Array[] = [];

            let resolved = false;
            let sessionUpdated = false;
            let sessionFinished = false;
            let commitSent = false;
            let finishSent = false;
            let responseDone = false;
            let audioDone = false;
            let sessionCreatedModel = "";
            let sessionUpdatedModel = "";
            let sessionUpdateTimer: number | undefined;

            const sendJson = (payload: any) => {
                if (ws.readyState !== WebSocket.OPEN) return;
                ws.send(JSON.stringify(payload));
            };

            const sendTextPayloads = () => {
                const appendPayload = {
                    event_id: generateUUID(),
                    type: "input_text_buffer.append",
                    text,
                };
                sendJson(appendPayload);

                const commitPayload = {
                    event_id: generateUUID(),
                    type: "input_text_buffer.commit",
                };
                sendJson(commitPayload);
                commitSent = true;

                const finishPayload = {
                    event_id: generateUUID(),
                    type: "session.finish",
                };
                sendJson(finishPayload);
                finishSent = true;
            };

            ws.onopen = () => {
                const payload = {
                    event_id: taskId,
                    type: "session.update",
                    session: {
                        voice: options?.voice,
                        mode: "commit",
                        language_type: "Chinese",
                        response_format: "pcm",
                        sample_rate: options?.sampleRate || 24000,
                    },
                };
                sendJson(payload);

                sessionUpdateTimer = window.setTimeout(() => {
                    if (!sessionUpdated && !resolved) {
                        reject(new Error("Qwen WS session.updated not received within timeout."));
                        ws.close();
                    }
                }, 5000);
            };

            ws.onmessage = async (event) => {
                let data = event.data;
                if (data instanceof Blob) {
                    data = await data.arrayBuffer();
                }

                if (data instanceof ArrayBuffer) {
                    audioChunks.push(new Uint8Array(data));
                    return;
                }

                // Text frame (Realtime protocol)
                try {
                    const msg = JSON.parse(data);
                    const type = msg?.type || "unknown";
                    if (type === "error" || type === "response.error") {
                        const errMsg = msg?.error?.message || msg?.message || "Unknown error";
                        console.error("[Qwen WS] Error:", errMsg);
                        ws.close();
                        reject(new Error(`TTS Failed: ${errMsg}`));
                        return;
                    }

                    if (type === "session.created") {
                        sessionCreatedModel = msg?.session?.model || "";
                        return;
                    }

                    if (type === "session.updated") {
                        if (sessionUpdateTimer !== undefined) {
                            window.clearTimeout(sessionUpdateTimer);
                            sessionUpdateTimer = undefined;
                        }
                        sessionUpdated = true;
                        sessionUpdatedModel = msg?.session?.model || "";
                        if (sessionUpdatedModel && sessionUpdatedModel !== model) {
                            ws.close();
                            reject(
                                new Error(
                                    `Qwen WS session.updated model mismatch: requested=${model}, server=${sessionUpdatedModel}`
                                )
                            );
                            return;
                        }
                        sendTextPayloads();
                        return;
                    }

                    if (type === "input_text_buffer.committed") {
                        return;
                    }

                    if (type === "response.audio.delta" && msg?.delta) {
                        try {
                            const binStr = atob(msg.delta);
                            const len = binStr.length;
                            const bytes = new Uint8Array(len);
                            for (let i = 0; i < len; i++) {
                                bytes[i] = binStr.charCodeAt(i);
                            }
                            audioChunks.push(bytes);
                            return;
                        } catch (e) {
                            console.warn("Failed to decode base64 audio", e);
                        }
                    }

                    if (type === "response.audio.done") {
                        audioDone = true;
                        return;
                    }

                    if (type === "response.done") {
                        responseDone = true;
                        return;
                    }

                    if (type === "session.finished") {
                        sessionFinished = true;
                    }

                    if (sessionFinished) {
                        ws.close();

                        const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
                        if (totalLength === 0) {
                            reject(new Error("Qwen WS finished without audio chunks."));
                            return;
                        }

                        const combined = new Uint8Array(totalLength);
                        let offset = 0;
                        for (const chunk of audioChunks) {
                            combined.set(chunk, offset);
                            offset += chunk.length;
                        }

                        const sampleRate = options?.sampleRate || 24000;
                        const wavBuffer = new ArrayBuffer(44 + combined.length);
                        const view = new DataView(wavBuffer);

                        const writeString = (offset: number, value: string) => {
                            for (let i = 0; i < value.length; i++) {
                                view.setUint8(offset + i, value.charCodeAt(i));
                            }
                        };

                        writeString(0, "RIFF");
                        view.setUint32(4, 36 + combined.length, true);
                        writeString(8, "WAVE");
                        writeString(12, "fmt ");
                        view.setUint32(16, 16, true);
                        view.setUint16(20, 1, true); // PCM
                        view.setUint16(22, 1, true); // mono
                        view.setUint32(24, sampleRate, true);
                        view.setUint32(28, sampleRate * 2, true); // byte rate
                        view.setUint16(32, 2, true); // block align
                        view.setUint16(34, 16, true); // bits per sample
                        writeString(36, "data");
                        view.setUint32(40, combined.length, true);
                        new Uint8Array(wavBuffer, 44).set(combined);

                        const blob = new Blob([wavBuffer], { type: "audio/wav" });
                        const audioUrl = URL.createObjectURL(blob);
                        resolved = true;
                        resolve({
                            audioUrl,
                            raw: {
                                taskId,
                                commitSent,
                                finishSent,
                                responseDone,
                                audioDone,
                            },
                        });
                        return;
                    }
                } catch (e) {
                    console.warn("WebSocket parse error", e);
                }
            };

            ws.onclose = (e) => {
                if (!resolved && audioChunks.length === 0) {
                    const summary = `model=${model}, sessionCreatedModel=${sessionCreatedModel || "unknown"}, sessionUpdated=${sessionUpdated}, sessionUpdatedModel=${sessionUpdatedModel || "unknown"}, commitSent=${commitSent}, finishSent=${finishSent}`;
                    reject(new Error(`WebSocket closed before receiving audio. ${summary}`));
                    return;
                }
                if (e.code !== 1000 && e.code !== 1005) {
                    reject(new Error(`WebSocket closed unexpectedly. Code: ${e.code}. Check console details.`));
                }
            };

            ws.onerror = (e) => {
                console.error("[Qwen WS] Error Event:", e);
                reject(new Error("WebSocket connection error (Check Proxy/Network)"));
            };
        });
    }

    // === FALLBACK: Standard REST for other models ===
    const body: any = {
        model,
        input: {
            text,
        },
        parameters: {
            format: options?.format || "wav",
            sample_rate: options?.sampleRate || 24000,
            volume: options?.volume ?? 50,
            speech_rate: options?.speechRate ?? 1.0,
            pitch: options?.pitch ?? 1.0,
        },
    };

    if (options?.voice) {
        body.input.voice = options.voice;
    } else if (options?.voicePrompt) {
        body.input.voice_prompt = options.voicePrompt;
    }

    if (options?.voice?.includes('vd-')) {
        delete body.parameters.pitch;
    } else if (options?.instruction) {
        body.parameters.instruction = options.instruction;
    }

    const res = await fetchViaProxy(GENERATE_BASE, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "X-DashScope-SSE": "disable",
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Qwen TTS failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const audioUrl = data?.output?.audio_url || "";

    return {
        audioUrl,
        raw: data,
    };
};

/**
 * Fetch available voices/timbres for Qwen3-TTS
 */
export const fetchVoices = async () => {
    // These are built-in voices. For custom voices, use createCustomVoice
    return [
        { id: "gentle_girl", label: "温柔少女" },
        { id: "mature_male", label: "成熟男声" },
        { id: "sichuanese_grandpa", label: "四川话爷爷" },
        { id: "cantonese_lady", label: "粤语女士" },
    ];
};
