import type {
  AnnotationNodeData,
  AudioInputNodeData,
  IdentityCardNodeData,
  ImageGenNodeData,
  ImageInputNodeData,
  KnowledgeNodeData,
  NodeFlowNodeData,
  NodeType,
  ScriptBoardNodeData,
  SeedanceVideoGenNodeData,
  ShotNodeData,
  StoryboardBoardNodeData,
  TextNodeData,
  ViduVideoGenNodeData,
  VideoInputNodeData,
  VideoGenNodeData,
} from "../types";

export const createDefaultNodeFlowNodeData = (type: NodeType): NodeFlowNodeData => {
  switch (type) {
    case "imageInput":
      return {
        image: null,
        filename: null,
        dimensions: null,
        label: "",
      } as ImageInputNodeData;
    case "audioInput":
      return {
        audio: null,
        filename: null,
        mimeType: null,
        durationMs: null,
        label: "",
      } as AudioInputNodeData;
    case "videoInput":
      return {
        video: null,
        filename: null,
        mimeType: null,
        durationMs: null,
        dimensions: null,
        aspectRatio: null,
        resolution: null,
        model: null,
        label: "",
      } as VideoInputNodeData;
    case "annotation":
      return {
        sourceImage: null,
        annotations: [],
        outputImage: null,
      } as AnnotationNodeData;
    case "knowledge":
      return {
        title: "Knowledge",
        plane: "semantic",
        assetType: "semantic.note",
        content: "",
        tags: [],
        sourceRefs: [],
        status: "draft",
        confidence: "medium",
        locked: false,
        fields: {},
      } as KnowledgeNodeData;
    case "text":
      return {
        title: "",
        text: "",
      } as TextNodeData;
    case "scriptBoard":
      return {
        title: "剧本面板",
      } as ScriptBoardNodeData;
    case "storyboardBoard":
      return {
        title: "分镜表面板",
        displayMode: "table",
        columnWidths: [96, 280, 170, 220, 220, 200, 180, 180, 280, 280],
        rowHeights: {},
      } as StoryboardBoardNodeData;
    case "identityCard":
      return {
        title: "角色 / 场景身份卡片",
        avatarOverrides: {},
      } as IdentityCardNodeData;
    case "imageGen":
      return {
        inputImages: [],
        outputImage: null,
        status: "idle",
        error: null,
        aspectRatio: "1:1",
        taskRequestedAt: null,
        taskSubmittedAt: null,
        processingStartedAt: null,
        taskCompletedAt: null,
        taskState: null,
        progressPercent: null,
        progressLabel: null,
        progressHint: null,
      } as ImageGenNodeData;
    case "nanoBananaImageGen":
      return {
        inputImages: [],
        outputImage: null,
        versionHistory: [],
        status: "idle",
        error: null,
        aspectRatio: "1:1",
        model: "nano banana pro",
        taskRequestedAt: null,
        taskSubmittedAt: null,
        processingStartedAt: null,
        taskCompletedAt: null,
        taskState: null,
        progressPercent: null,
        progressLabel: null,
        progressHint: null,
      } as ImageGenNodeData;
    case "wanImageGen":
      return {
        inputImages: [],
        outputImage: null,
        status: "idle",
        error: null,
        aspectRatio: "1:1",
        model: "wan2.6-image",
        enableInterleave: false,
        watermark: false,
        outputCount: 1,
      } as ImageGenNodeData;
    case "soraVideoGen":
      return {
        inputImages: [],
        videoId: undefined,
        videoUrl: undefined,
        status: "idle",
        error: null,
        aspectRatio: "16:9",
      } as VideoGenNodeData;
    case "wanReferenceVideoGen":
      return {
        inputImages: [],
        referenceImages: [],
        referenceVideos: [],
        referenceAudios: [],
        firstFrameImage: null,
        projectReferenceTargets: [],
        videoId: undefined,
        videoUrl: undefined,
        status: "idle",
        error: null,
        aspectRatio: "16:9",
        duration: "5s",
        model: "wan2.7-r2v",
        resolution: "1080P",
        watermark: false,
      } as VideoGenNodeData;
    case "viduVideoGen":
      return {
        inputImages: [],
        videoId: undefined,
        videoUrl: undefined,
        status: "idle",
        error: null,
        progressPercent: null,
        progressLabel: null,
        progressHint: null,
        taskState: null,
        taskRequestedAt: null,
        taskSubmittedAt: null,
        processingStartedAt: null,
        taskCompletedAt: null,
        lastCreditsCost: null,
        authProbeStatus: "idle",
        authProbeSummary: null,
        authProbeDetail: null,
        mode: "subject",
        useCharacters: true,
        autoSubjects: false,
        aspectRatio: "16:9",
        resolution: "720p",
        duration: 5,
        audioEnabled: true,
        offPeak: false,
        watermark: false,
        bgm: false,
        model: "viduq3",
      } as ViduVideoGenNodeData;
    case "seedanceVideoGen":
      return {
        inputImages: [],
        referenceVideos: [],
        referenceAudios: [],
        videoId: undefined,
        videoUrl: undefined,
        status: "idle",
        error: null,
        model: "doubao-seedance-2-0-260128",
        mode: "multimodalReference",
        resolution: "720p",
        ratio: "adaptive",
        duration: 5,
        generateAudio: true,
        watermark: false,
      } as SeedanceVideoGenNodeData;
    case "shot":
      return {
        shotId: "S-1",
        duration: "3s",
        shotType: "Medium Shot",
        focalLength: "",
        movement: "Static",
        composition: "",
        blocking: "",
        dialogue: "",
        sound: "",
        lightingVfx: "",
        editingNotes: "",
        notes: "",
        soraPrompt: "",
        storyboardPrompt: "",
        viewMode: "card",
      } as ShotNodeData;
  }
};
