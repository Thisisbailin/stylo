import React, { useState, useRef, useMemo } from 'react';
import {
    MonitorPlay,
    AudioLines,
    Sparkles,
    Play,
    Volume2,
    Settings2,
    Mic,
    History,
    Download,
    Loader2,
    Trash2,
    ChevronRight,
    Activity,
    UserCircle,
    Music,
    FastForward,
    Settings,
    Layers,
    Save,
    RotateCcw,
    AlertTriangle,
    X,
    Check
} from 'lucide-react';
import { useConfig } from '../hooks/useConfig';
import * as QwenAudio from '../services/qwenAudioService';
import { ProjectData } from '../types';
import { projectRolesToCharacters } from '../utils/projectRoles';

type LabStage = 'design' | 'dubbing';

type ProjectorProps = {
    projectData?: ProjectData;
    setProjectData?: React.Dispatch<React.SetStateAction<ProjectData>>;
};

export const ProjectorModule: React.FC<ProjectorProps> = ({ projectData, setProjectData }) => {
    const { config, setConfig } = useConfig("qalam_config_v1");
    const [activeType, setActiveType] = useState<'visuals' | 'audio'>('audio');
    const [stage, setStage] = useState<LabStage>('design');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const qwenModels = useMemo(
        () => (config.textConfig.qwenModels || []) as Array<{ id?: string; model?: string; name?: string }>,
        [config.textConfig.qwenModels]
    );
    const audioModelIds = useMemo(() => {
        const ids = qwenModels
            .map((model) => model.id || model.model || model.name || "")
            .map((id) => id.trim())
            .filter((id) => id.length > 0)
            .filter((id) => {
                const lower = id.toLowerCase();
                return lower.includes("tts") || lower.includes("audio") || lower.includes("speech");
            });
        return Array.from(new Set(ids));
    }, [qwenModels]);
    const voiceDesignModelIds = useMemo(
        () => audioModelIds.filter((id) => id.toLowerCase().includes("tts-vd")),
        [audioModelIds]
    );
    const voiceDubbingModelIds = useMemo(
        () => audioModelIds.filter((id) => !id.toLowerCase().includes("tts-vd")),
        [audioModelIds]
    );
    const designModelOptions = voiceDesignModelIds.length ? voiceDesignModelIds : audioModelIds;
    const dubbingModelOptions = voiceDubbingModelIds.length ? voiceDubbingModelIds : audioModelIds;
    const resolveModelSelection = (preferred: string | undefined, options: string[]) => {
        if (preferred && options.includes(preferred)) return preferred;
        return options[0] || "";
    };
    const activeDesignModel = resolveModelSelection(config.textConfig.voiceDesignModel, designModelOptions);
    const activeDubbingModel = resolveModelSelection(config.textConfig.voiceDubbingModel, dubbingModelOptions);

    // --- Persona Design State (Stage 1) ---
    const [designPrompt, setDesignPrompt] = useState('一位深沉、睿智的老者，声音里带着故事感，语速适中且平稳。');
    const [previewText, setPreviewText] = useState('在这个充满奇迹的世界里，每一个决定都将改写未来的篇章。');
    const [designRate, setDesignRate] = useState(1.0);
    const [designVolume, setDesignVolume] = useState(50);
    const [designPitch, setDesignPitch] = useState(1.0);

    // --- Character Dubbing State (Stage 2) ---
    const [dubbingText, setDubbingText] = useState('既然如此，那就按照你的计划进行吧。但记住，这是最后的机会。');
    const [atmosphere, setAtmosphere] = useState('语气庄重、缓慢，每一个字都带着不容置疑的力量。');
    const [dubbingRate, setDubbingRate] = useState(1.0);
    const [dubbingVolume, setDubbingVolume] = useState(50);
    const [selectedCharId, setSelectedCharId] = useState<string>("");

    const allCharacters = useMemo(() => {
        return projectRolesToCharacters(projectData?.context.roles || []);
    }, [projectData?.context.roles]);

    const charactersWithVoice = useMemo(() => {
        return allCharacters.filter(c => c.voiceId) || [];
    }, [allCharacters]);

    const activeCharacter = useMemo(() => {
        return charactersWithVoice.find(c => c.id === selectedCharId);
    }, [charactersWithVoice, selectedCharId]);

    // Automatically ensure the dubbing model is set to the required one for designed voices
    React.useEffect(() => {
        if (activeCharacter?.voiceId && stage === 'dubbing') {
            const requiredModel = "qwen3-tts-vd-realtime-2025-12-16";
            if (activeDubbingModel !== requiredModel) {
                setConfig(prev => ({
                    ...prev,
                    textConfig: { ...prev.textConfig, voiceDubbingModel: requiredModel }
                }));
            }
        }
    }, [activeCharacter, stage, activeDubbingModel, setConfig]);

    // --- Common Logic ---
    const [isGenerating, setIsGenerating] = useState(false);
    const [audioResult, setAudioResult] = useState<{ url: string; prompt: string; text: string; time: number; type: LabStage; voiceId?: string } | null>(null);
    const [history, setHistory] = useState<Array<{ url: string; prompt: string; text: string; time: number; type: LabStage; voiceId?: string }>>([]);
    const [showSaveDialog, setShowSaveDialog] = useState(false);

    const audioRef = useRef<HTMLAudioElement>(null);
    const formatErrorMessage = (error: any) => {
        const raw = error?.message || "生成失败，请稍后再试。";
        if (raw.includes("Missing Qwen API key")) {
            return "未检测到 QWEN_API_KEY / VITE_QWEN_API_KEY，请先配置密钥后再试。";
        }
        return raw;
    };

    const handleGenerate = async () => {
        const currentText = stage === 'design' ? previewText : dubbingText;
        if (!currentText.trim()) return;

        setIsGenerating(true);
        setErrorMessage(null);
        try {
            if (stage === 'design') {
                // Stage 1: Design Persona -> Use CreateCustomVoice to get a voiceId
                const result = await QwenAudio.createCustomVoice({
                    voicePrompt: designPrompt,
                    previewText: currentText,
                    language: 'zh'
                });

                const newEntry = {
                    url: result.previewAudioUrl,
                    prompt: designPrompt,
                    text: currentText,
                    time: Date.now(),
                    type: stage,
                    voiceId: result.voiceId
                };

                setAudioResult(newEntry);
                setHistory(prev => [newEntry, ...prev]);

            } else {
                // Stage 2: Dubbing -> Use GenerateSpeech with the specific Voice ID
                // Verify activeCharacter and logs
                console.log("[ProjectorModule] Dubbing Start");
                console.log("[ProjectorModule] Active Character:", activeCharacter);
                console.log("[ProjectorModule] Voice ID:", activeCharacter?.voiceId);

                if (!activeCharacter?.voiceId) {
                    throw new Error("请先选择一个拥有自定音色的角色。");
                }

                const result = await QwenAudio.generateSpeech(currentText, {
                    // Force the required model for VD voices
                    model: "qwen3-tts-vd-realtime-2025-12-16",
                    voice: activeCharacter.voiceId,
                    // Atmosphere/Instruction is NOT supported for VD voices
                    speechRate: dubbingRate,
                    volume: dubbingVolume,
                    // Pitch is NOT supported for VD voices
                });

                if (!result.audioUrl) {
                    throw new Error("Qwen TTS 未返回音频地址，请重试。");
                }

                const newEntry = {
                    url: result.audioUrl,
                    prompt: "Designed Voice Dubbing",
                    text: currentText,
                    time: Date.now(),
                    type: stage,
                    voiceId: activeCharacter.voiceId
                };

                setAudioResult(newEntry);
                setHistory(prev => [newEntry, ...prev]);
            }
        } catch (e: any) {
            setErrorMessage(formatErrorMessage(e));
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSaveVoice = (characterId: string) => {
        if (!audioResult?.voiceId || !setProjectData) return;

        setProjectData(prev => ({
            ...prev,
            context: {
                ...prev.context,
                roles: (prev.context.roles || []).map(role =>
                    role.id === characterId
                        ? { ...role, voiceId: audioResult.voiceId! }
                        : role
                )
            }
        }));
        setShowSaveDialog(false);
        alert("音色已保存至角色！"); // Simple feedback
    };

    const clearHistory = () => {
        if (window.confirm("确定要清空历史记录吗？")) {
            setHistory([]);
            setAudioResult(null);
        }
    };

    return (
        <div className="flex bg-[var(--app-bg)] h-[750px] overflow-hidden text-[var(--app-text-primary)]">
            {/* SIDEBAR (Agent Settings Style) */}
            <div className="w-[260px] border-r border-[var(--app-border)] bg-[var(--app-panel-muted)] flex flex-col p-4 space-y-4">
                <div className="space-y-3">
                    <div className="text-[11px] uppercase tracking-widest text-[var(--app-text-muted)] px-1">Navigation</div>
                    <div className="flex flex-col gap-2">
                        {[
                            { key: 'audio' as const, label: 'Voice Lab', Icon: AudioLines, active: activeType === 'audio' },
                            { key: 'visuals' as const, label: 'Visuals', Icon: MonitorPlay, active: activeType === 'visuals' },
                        ].map(({ key, label, Icon, active }) => (
                            <button
                                key={key}
                                onClick={() => setActiveType(key)}
                                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] border transition ${active
                                    ? "bg-[var(--app-panel-soft)] border-[var(--app-border-strong)] text-[var(--app-text-primary)]"
                                    : "border-transparent text-[var(--app-text-secondary)] hover:bg-[var(--app-panel-soft)]"
                                    }`}
                            >
                                <Icon size={16} className={active ? "text-[var(--app-text-primary)]" : "text-[var(--app-text-muted)]"} />
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {activeType === 'audio' && (
                    <div className="space-y-3 pt-2">
                        <div className="text-[11px] uppercase tracking-widest text-[var(--app-text-muted)] px-1">Lab Stages</div>
                        <div className="flex flex-col gap-2">
                            {[
                                { key: 'design' as const, label: '1. 音色设计', desc: 'Craft unique persona' },
                                { key: 'dubbing' as const, label: '2. 精细配音', desc: 'Emotional delivery' },
                            ].map(({ key, label, desc }) => (
                                <button
                                    key={key}
                                    onClick={() => setStage(key)}
                                    className={`flex flex-col gap-0.5 px-4 py-3 rounded-xl border transition text-left ${stage === key
                                        ? "bg-[var(--app-panel-soft)] border-[var(--app-border-strong)]"
                                        : "border-transparent hover:bg-[var(--app-panel-soft)]"
                                        }`}
                                >
                                    <div className={`text-[12px] font-bold ${stage === key ? "text-[var(--app-text-primary)]" : "text-[var(--app-text-secondary)]"}`}>{label}</div>
                                    <div className="text-[10px] text-[var(--app-text-muted)]">{desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-auto pt-4 border-t border-[var(--app-border)]">
                    <div className="text-[10px] text-[var(--app-text-muted)] px-1 leading-relaxed">
                        Qwen3-TTS-VD Powering<br />
                        Next-gen expressive audio.
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 flex flex-col min-w-0 bg-[var(--app-bg)] relative overflow-hidden">
                {activeType === 'visuals' ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                        <div className="h-20 w-20 rounded-2xl bg-[var(--app-panel-muted)] border border-dashed border-[var(--app-border-strong)] flex items-center justify-center text-[var(--app-text-muted)] mb-4">
                            <MonitorPlay size={32} />
                        </div>
                        <h3 className="text-lg font-semibold text-[var(--app-text-primary)]">画面放映空间</h3>
                        <p className="text-sm text-[var(--app-text-secondary)] max-w-sm mt-2 leading-relaxed italic">
                            此处将用于预览生成的视频剪辑。目前功能正在整合中，后续将实现音画精准对位放映。
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Header Area */}
                        <div className="px-6 py-5 border-b border-[var(--app-border)] flex flex-wrap items-center justify-between gap-4 bg-[var(--app-panel-muted)]">
                            <div className="space-y-1">
                                <div className="text-[13px] font-semibold flex items-center gap-2">
                                    <Sparkles className="text-[var(--app-accent-strong)]" size={16} />
                                    {stage === 'design' ? 'Persona Design Lab (音色实验室)' : 'Expressive Dubbing (角色配音室)'}
                                </div>
                                <p className="text-[11px] text-[var(--app-text-muted)] tracking-wide">
                                    {stage === 'design' ? '通过自然语言描述，创造剧本中独一无二的音色纹理。' : '基于设计好的音色，注入情节氛围完成角色对白。'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="px-3 py-1 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] text-[10px] text-[var(--app-text-secondary)]">
                                    Qwen TTS
                                </span>
                                <span
                                    className="px-3 py-1 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] text-[10px] text-[var(--app-text-secondary)] max-w-[220px] truncate"
                                    title={stage === 'design' ? activeDesignModel || "auto" : activeDubbingModel || "auto"}
                                >
                                    {stage === 'design' ? activeDesignModel || "auto" : activeDubbingModel || "auto"}
                                </span>
                            </div>
                        </div>

                        {/* Editor Content */}
                        <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
                            <div className="max-w-3xl mx-auto space-y-6 pb-16">
                                <section className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="text-[12px] font-semibold text-[var(--app-text-primary)]">音色模型</div>
                                        <div className="text-[10px] text-[var(--app-text-muted)]">来自 Agent Settings</div>
                                    </div>
                                    {audioModelIds.length === 0 ? (
                                        <div className="flex items-center gap-2 text-[12px] text-[var(--app-text-secondary)]">
                                            <AlertTriangle size={14} className="text-amber-300" />
                                            未检测到音频模型，请先在 Agent Settings 拉取 Qwen 模型。
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {stage === 'design' ? (
                                                <div className="space-y-2">
                                                    <label className="text-[10px] uppercase tracking-widest text-[var(--app-text-muted)]">
                                                        音色设计模型
                                                    </label>
                                                    <select
                                                        value={activeDesignModel}
                                                        onChange={(e) =>
                                                            setConfig((prev) => ({
                                                                ...prev,
                                                                textConfig: { ...prev.textConfig, voiceDesignModel: e.target.value },
                                                            }))
                                                        }
                                                        className="w-full bg-[var(--app-panel-soft)] border border-[var(--app-border)] rounded-xl px-3 py-2 text-[12px] text-[var(--app-text-primary)] focus:ring-1 focus:ring-[var(--app-accent-soft)] focus:outline-none"
                                                    >
                                                        {designModelOptions.map((id) => (
                                                            <option key={`design-${id}`} value={id}>
                                                                {id}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ) : (
                                                <div className="col-span-2 space-y-2">
                                                    <label className="text-[10px] uppercase tracking-widest text-[var(--app-text-muted)]">
                                                        Working Model
                                                    </label>
                                                    <div className="w-full bg-[var(--app-panel-soft)] border border-[var(--app-border)] rounded-xl px-3 py-2 text-[12px] text-[var(--app-text-primary)] opacity-70">
                                                        qwen3-tts-vd-realtime-2025-12-16
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </section>

                                {errorMessage && (
                                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-200 flex items-start gap-2">
                                        <AlertTriangle size={14} className="mt-0.5" />
                                        <span>{errorMessage}</span>
                                    </div>
                                )}

                                {stage === 'design' ? (
                                    <>
                                        {/* STAGE 1: DESIGN */}
                                        <section className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--app-text-muted)] flex items-center gap-2">
                                                    <UserCircle size={14} className="text-[var(--app-accent-strong)]" />
                                                    Persona Description (音色定形描述)
                                                </label>
                                                <button className="text-[10px] px-2.5 py-1 rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)] transition">
                                                    Load Template
                                                </button>
                                            </div>
                                            <textarea
                                                value={designPrompt}
                                                onChange={(e) => setDesignPrompt(e.target.value)}
                                                className="w-full h-28 bg-[var(--app-panel-soft)] border border-[var(--app-border)] rounded-2xl p-4 text-[13px] text-[var(--app-text-primary)] focus:ring-1 focus:ring-[var(--app-accent-soft)] focus:outline-none transition-all resize-none"
                                                placeholder="例如：'一位优雅的王后，声线清冷且高贵，透着淡淡的哀愁...'"
                                            />
                                            <p className="text-[10px] text-[var(--app-text-muted)] italic">提示：通过性别、年龄、特征、情感倾向来精细化描述。</p>
                                        </section>

                                        <section className="space-y-4">
                                            <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--app-text-muted)] flex items-center gap-2">
                                                <Music size={14} className="text-[var(--app-accent-strong)]" />
                                                Tone Tuning (细致化声学参数)
                                            </label>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)]">
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] text-[var(--app-text-secondary)]">Speed (语速)</span>
                                                        <span className="text-[11px] font-mono text-[var(--app-accent-strong)]">{designRate.toFixed(1)}x</span>
                                                    </div>
                                                    <input type="range" min="0.5" max="2.0" step="0.1" value={designRate} onChange={(e) => setDesignRate(parseFloat(e.target.value))} className="w-full h-1.5 bg-[var(--app-border)] rounded-lg appearance-none cursor-pointer accent-[var(--app-accent)]" />
                                                </div>
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] text-[var(--app-text-secondary)]">Pitch (音调)</span>
                                                        <span className="text-[11px] font-mono text-[var(--app-accent-strong)]">{designPitch.toFixed(1)}x</span>
                                                    </div>
                                                    <input type="range" min="0.5" max="2.0" step="0.1" value={designPitch} onChange={(e) => setDesignPitch(parseFloat(e.target.value))} className="w-full h-1.5 bg-[var(--app-border)] rounded-lg appearance-none cursor-pointer accent-[var(--app-accent)]" />
                                                </div>
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] text-[var(--app-text-secondary)]">Volume (音量)</span>
                                                        <span className="text-[11px] font-mono text-[var(--app-accent-strong)]">{designVolume}%</span>
                                                    </div>
                                                    <input type="range" min="0" max="100" step="1" value={designVolume} onChange={(e) => setDesignVolume(parseInt(e.target.value))} className="w-full h-1.5 bg-[var(--app-border)] rounded-lg appearance-none cursor-pointer accent-[var(--app-accent)]" />
                                                </div>
                                            </div>
                                        </section>

                                        <section className="space-y-4">
                                            <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--app-text-muted)] flex items-center gap-2">
                                                <Layers size={14} className="text-[var(--app-accent-strong)]" />
                                                Validation Text (测试演化文本)
                                            </label>
                                            <input
                                                value={previewText}
                                                onChange={(e) => setPreviewText(e.target.value)}
                                                className="w-full bg-[var(--app-panel-soft)] border border-[var(--app-border)] rounded-2xl px-4 py-3 text-[13px] text-[var(--app-text-primary)] focus:ring-1 focus:ring-[var(--app-accent-soft)] focus:outline-none transition-all"
                                                placeholder="请输入用于测试音色的文本..."
                                            />
                                        </section>
                                    </>
                                ) : (
                                    <>
                                        {/* STAGE 2: DUBBING */}
                                        <div className="p-4 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] space-y-4 mb-6">
                                            <div className="flex items-center justify-between">
                                                <div className="text-[12px] font-semibold text-[var(--app-text-primary)]">选择设计的角色音色</div>
                                                <div className="text-[10px] text-[var(--app-text-muted)]">{charactersWithVoice.length} 个可用角色</div>
                                            </div>

                                            {charactersWithVoice.length > 0 ? (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {charactersWithVoice.map(char => (
                                                        <button
                                                            key={char.id}
                                                            onClick={() => setSelectedCharId(char.id)}
                                                            className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition text-left ${selectedCharId === char.id
                                                                ? "bg-violet-500/10 border-violet-500/50"
                                                                : "border-[var(--app-border)] bg-[var(--app-panel-soft)] hover:border-[var(--app-border-strong)]"
                                                                }`}
                                                        >
                                                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${selectedCharId === char.id ? "bg-violet-500 text-white" : "bg-[var(--app-panel-muted)] text-[var(--app-text-secondary)]"}`}>
                                                                <UserCircle size={18} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="text-[11px] font-bold truncate">{char.name}</div>
                                                                <div className="text-[9px] text-[var(--app-text-muted)] truncate">{char.voiceId}</div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                    <button
                                                        onClick={() => setSelectedCharId("")}
                                                        className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition text-left ${!selectedCharId
                                                            ? "bg-[var(--app-accent-soft)] border-[var(--app-accent-strong)]"
                                                            : "border-[var(--app-border)] bg-[var(--app-panel-soft)] hover:border-[var(--app-border-strong)]"
                                                            }`}
                                                    >
                                                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${!selectedCharId ? "bg-[var(--app-accent)] text-white" : "bg-[var(--app-panel-muted)] text-[var(--app-text-secondary)]"}`}>
                                                            <Sparkles size={18} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="text-[11px] font-bold truncate">即时设计</div>
                                                            <div className="text-[9px] text-[var(--app-text-muted)] truncate">使用下方左侧描述</div>
                                                        </div>
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="text-[11px] text-[var(--app-text-secondary)] italic p-2 border border-dashed border-[var(--app-border)] rounded-xl text-center">
                                                    尚未在“角色库”中设计角色音色。
                                                </div>
                                            )}

                                            {!selectedCharId && (
                                                <div className="flex items-center gap-3 p-3 bg-[var(--app-panel-soft)] rounded-xl border border-[var(--app-border)]">
                                                    <div className="h-8 w-8 rounded-lg bg-[var(--app-panel-muted)] flex items-center justify-center text-[var(--app-accent-strong)]">
                                                        <Mic size={16} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-[11px] font-bold text-[var(--app-text-primary)]">音色随描述演化</div>
                                                        <div className="text-[10px] text-[var(--app-text-muted)] truncate">{designPrompt}</div>
                                                    </div>
                                                    <button onClick={() => setStage('design')} className="px-2 py-1 rounded-lg border border-[var(--app-border)] text-[9px] font-semibold text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] transition">
                                                        修改描述
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <section className="space-y-4">
                                            <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--app-text-muted)] flex items-center gap-2">
                                                <Mic size={14} className="text-[var(--app-accent-strong)]" />
                                                Dialogue Line (待配音对白)
                                            </label>
                                            <textarea
                                                value={dubbingText}
                                                onChange={(e) => setDubbingText(e.target.value)}
                                                className="w-full h-36 bg-[var(--app-panel-soft)] border border-[var(--app-border)] rounded-2xl p-4 text-[14px] leading-relaxed text-[var(--app-text-primary)] focus:ring-1 focus:ring-[var(--app-accent-soft)] focus:outline-none transition-all resize-none"
                                                placeholder="请输入剧本对白..."
                                            />
                                        </section>

                                        <section className="space-y-4">
                                            <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--app-text-muted)] flex items-center gap-2">
                                                <Settings size={14} className="text-[var(--app-accent-strong)]" />
                                                Acoustic Fine Tuning (精细声学调节)
                                            </label>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)]">
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] text-[var(--app-text-secondary)]">Speed (语速)</span>
                                                        <span className="text-[11px] font-mono text-[var(--app-accent-strong)]">{dubbingRate.toFixed(1)}x</span>
                                                    </div>
                                                    <input type="range" min="0.5" max="2.0" step="0.1" value={dubbingRate} onChange={(e) => setDubbingRate(parseFloat(e.target.value))} className="w-full h-1.5 bg-[var(--app-border)] rounded-lg appearance-none cursor-pointer accent-[var(--app-accent)]" />
                                                </div>
                                                <div className="space-y-4 opacity-50 pointer-events-none grayscale">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] text-[var(--app-text-secondary)]">Pitch (音调)</span>
                                                        <span className="text-[11px] font-mono text-[var(--app-accent-strong)]">Locked</span>
                                                    </div>
                                                    <input type="range" disabled value={1.0} className="w-full h-1.5 bg-[var(--app-border)] rounded-lg appearance-none cursor-not-allowed" />
                                                </div>
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] text-[var(--app-text-secondary)]">Volume (音量)</span>
                                                        <span className="text-[11px] font-mono text-[var(--app-accent-strong)]">{dubbingVolume}%</span>
                                                    </div>
                                                    <input type="range" min="0" max="100" step="1" value={dubbingVolume} onChange={(e) => setDubbingVolume(parseInt(e.target.value))} className="w-full h-1.5 bg-[var(--app-border)] rounded-lg appearance-none cursor-pointer accent-[var(--app-accent)]" />
                                                </div>
                                            </div>
                                        </section>
                                    </>
                                )}

                                <div className="pt-6">
                                    <button
                                        onClick={handleGenerate}
                                        disabled={isGenerating}
                                        className={`w-full py-4 rounded-2xl font-semibold flex items-center justify-center gap-3 transition-all text-[13px] ${isGenerating
                                            ? 'bg-[var(--app-panel-soft)] text-[var(--app-text-muted)] cursor-not-allowed border border-[var(--app-border)]'
                                            : 'bg-[var(--app-accent)] text-white hover:bg-[var(--app-accent-strong)] active:scale-[0.99] border border-transparent'
                                            }`}
                                    >
                                        {isGenerating ? (
                                            <>
                                                <Loader2 size={18} className="animate-spin" />
                                                正在演化声波与情感...
                                            </>
                                        ) : (
                                            <>
                                                <Play size={18} fill="currentColor" />
                                                {stage === 'design' ? '演化音色并试听' : '完成精准对白配音'}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* PREVIEW & HISTORY PANEL (Right Sidebar) */}
            <div className="w-[340px] border-l border-[var(--app-border)] bg-[var(--app-panel-muted)] flex flex-col overflow-hidden">
                <div className="p-5 border-b border-[var(--app-border)] bg-[var(--app-panel-muted)]">
                    <h4 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--app-text-muted)] mb-4 flex items-center justify-between">
                        Real-time Monitoring
                        <span className={`h-2 w-2 rounded-full ${isGenerating ? 'bg-[var(--app-accent-strong)] animate-pulse' : 'bg-emerald-400'}`} />
                    </h4>

                    {audioResult ? (
                        <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                            <div className="rounded-2xl bg-[var(--app-panel-soft)] p-4 flex flex-col items-center justify-center border border-[var(--app-border)] relative group">
                                <div className="flex items-center gap-4">
                                    <button
                                        type="button"
                                        className="h-14 w-14 rounded-full bg-[var(--app-accent)] text-white flex items-center justify-center hover:bg-[var(--app-accent-strong)] transition shadow-lg shadow-[var(--app-accent-soft)]"
                                        onClick={() => audioRef.current?.play()}
                                    >
                                        <Volume2 size={26} />
                                    </button>

                                    <a
                                        href={audioResult.url}
                                        download={`persona_${activeCharacter?.name || 'voice'}_${Date.now()}.wav`}
                                        className="h-10 w-10 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] text-[var(--app-text-secondary)] flex items-center justify-center hover:bg-[var(--app-panel-strong)] hover:text-[var(--app-text-primary)] transition"
                                        title="下载预览音频"
                                    >
                                        <Download size={18} />
                                    </a>
                                </div>

                                <audio ref={audioRef} src={audioResult.url} autoPlay />
                                <div className="mt-3 text-center">
                                    <div className="text-[11px] font-semibold text-[var(--app-text-primary)]">试听就绪</div>
                                    <div className="text-[10px] text-[var(--app-text-muted)] mt-1">
                                        {audioResult.type === 'design' ? 'Persona Tuning Output' : 'Dubbing Synthesis Output'}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <a
                                    href={audioResult.url}
                                    download
                                    target="_blank"
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] text-[11px] font-semibold text-[var(--app-text-primary)] hover:border-[var(--app-border-strong)] transition-all"
                                >
                                    <Download size={14} className="text-[var(--app-accent-strong)]" /> Export Audio
                                </a>
                                <button
                                    className={`h-9 w-9 rounded-xl border transition-all flex items-center justify-center ${audioResult.voiceId
                                        ? "border-[var(--app-border)] bg-[var(--app-panel-soft)] hover:border-[var(--app-accent-strong)] text-[var(--app-text-secondary)] hover:text-[var(--app-accent-strong)]"
                                        : "border-transparent bg-transparent opacity-30 cursor-not-allowed"
                                        }`}
                                    title="Save Persona to Character"
                                    onClick={() => audioResult.voiceId && setShowSaveDialog(true)}
                                    disabled={!audioResult.voiceId}
                                >
                                    <Save size={16} />
                                </button>
                            </div>

                            {showSaveDialog && (
                                <div className="absolute inset-0 bg-[var(--app-bg)]/90 backdrop-blur-sm z-50 flex flex-col p-4 animate-in fade-in duration-200">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="text-[12px] font-bold">Save Voice To...</div>
                                        <button onClick={() => setShowSaveDialog(false)} className="text-[var(--app-text-muted)] hover:text-[var(--app-text-primary)]">
                                            <X size={14} />
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                                        {allCharacters.map(char => (
                                            <button
                                                key={char.id}
                                                onClick={() => handleSaveVoice(char.id)}
                                                className="w-full flex items-center gap-3 p-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] hover:border-[var(--app-accent-strong)] transition-all text-left"
                                            >
                                                <div className="h-8 w-8 rounded-lg bg-[var(--app-panel-muted)] flex items-center justify-center text-[var(--app-text-secondary)]">
                                                    <UserCircle size={18} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-[11px] font-bold truncate">{char.name}</div>
                                                    <div className="text-[9px] text-[var(--app-text-muted)] truncate">ID: {char.id}</div>
                                                </div>
                                                {char.voiceId === audioResult.voiceId && (
                                                    <Check size={14} className="ml-auto text-emerald-400" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-40 rounded-2xl border border-dashed border-[var(--app-border)] flex flex-col items-center justify-center text-[var(--app-text-muted)] p-6 text-center">
                            <Activity className="opacity-30 mb-3" size={28} />
                            <div className="text-[12px] font-medium opacity-70">等待声码演化...</div>
                            <div className="text-[10px] opacity-50 mt-2">生成后可在此试听与导出。</div>
                        </div>
                    )}
                </div>

                {/* Evolution History */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-5 py-4 flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-panel-muted)]">
                        <h4 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--app-text-muted)] flex items-center gap-2">
                            <History size={12} className="text-[var(--app-accent-strong)]" /> 演化历史 (History)
                        </h4>
                        <button
                            onClick={clearHistory}
                            className="h-7 w-7 rounded-lg flex items-center justify-center border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Clear All"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar space-y-3">
                        {history.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 opacity-20">
                                <FastForward size={32} />
                                <span className="text-[10px] mt-2 font-mono">NO RECORDS</span>
                            </div>
                        ) : (
                            history.map((item, idx) => (
                                <button
                                    key={`${item.time}-${idx}`}
                                    onClick={() => {
                                        setAudioResult(item);
                                        audioRef.current?.play();
                                    }}
                                    className={`w-full text-left p-4 rounded-2xl border transition-all relative group overflow-hidden ${audioResult?.time === item.time
                                        ? 'border-[var(--app-accent-strong)] bg-[var(--app-accent-soft)] shadow-sm'
                                        : 'border-transparent hover:border-[var(--app-border-strong)] bg-[var(--app-panel-soft)]'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className={`h-1.5 w-1.5 rounded-full ${item.type === 'design' ? 'bg-[var(--app-accent-strong)]' : 'bg-emerald-400'}`} />
                                            <div className="text-[9px] font-semibold text-[var(--app-text-muted)] uppercase tracking-tighter">
                                                {item.type === 'design' ? 'Designer' : 'Dubber'} • {new Date(item.time).toLocaleTimeString()}
                                            </div>
                                        </div>
                                        <ChevronRight size={12} className="text-[var(--app-text-muted)] opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0" />
                                    </div>
                                    <div className="text-[12px] text-[var(--app-text-primary)] line-clamp-1 pr-4">"{item.text}"</div>
                                    <div className="mt-2 text-[9px] text-[var(--app-text-muted)] line-clamp-1 opacity-60 flex items-center gap-1">
                                        <Settings2 size={8} /> {item.prompt}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div >
        </div >
    );
};
