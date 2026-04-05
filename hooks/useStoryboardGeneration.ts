import { useCallback } from "react";
import { AppConfig, ProjectData, Shot, TokenUsage, WorkflowStep } from "../types";
import * as ResponsesTextService from "../services/responsesTextService";
import { findNextStoryboardIndex, isEpisodeStoryboardComplete } from "../utils/episodes";

type ActiveTab = "assets" | "script" | "knowledge" | "table" | "visuals" | "video" | "stats";

type StoryboardGenParams = {
  projectDataRef: React.MutableRefObject<ProjectData>;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  config: AppConfig;
  setStep: (step: WorkflowStep) => void;
  setCurrentEpIndex: (idx: number) => void;
  setProcessing: (processing: boolean, status?: string) => void;
  setStatus: (status: string) => void;
  setActiveTab: (tab: ActiveTab) => void;
  updateStats: (phase: "context" | "shotGen" | "soraGen" | "storyboardGen", success: boolean) => void;
  isProcessing: boolean;
  currentEpIndex: number;
};

export const useStoryboardGeneration = ({
  projectDataRef,
  setProjectData,
  config,
  setStep,
  setCurrentEpIndex,
  setProcessing,
  setStatus,
  setActiveTab,
  updateStats,
  isProcessing,
  currentEpIndex,
}: StoryboardGenParams) => {
  const generateCurrentEpisodeStoryboard = useCallback(
    async (index: number, autoAdvance = false, forceRegenerate = false) => {
      const episodesList = projectDataRef.current.episodes || [];
      if (index >= episodesList.length) {
        setStep(WorkflowStep.COMPLETED);
        alert("All Storyboard Prompts Generated! You can proceed to image generation.");
        setCurrentEpIndex(0);
        setProcessing(false);
        return;
      }

      const episode = episodesList[index];
      if (!episode) return;

      if (episode.shots.length === 0 || isEpisodeStoryboardComplete(episode)) {
        const nextIndex = findNextStoryboardIndex(projectDataRef.current.episodes || [], index + 1);
        if (nextIndex === -1 || !autoAdvance) {
          if (nextIndex === -1 && autoAdvance) {
            setStep(WorkflowStep.COMPLETED);
            alert("All Storyboard Prompts Generated! You can proceed to image generation.");
            setCurrentEpIndex(0);
          }
          setProcessing(false);
          return;
        }
        setCurrentEpIndex(nextIndex);
        return generateCurrentEpisodeStoryboard(nextIndex, true);
      }

      const shouldResume = episode.status === "error";
      setProcessing(true, `Generating Storyboard Prompts for Episode ${episode.id}...`);

      setProjectData((prev) => {
        const newEpisodes = [...prev.episodes];
        newEpisodes[index] = { ...newEpisodes[index], status: "generating_storyboard", errorMsg: undefined };
        const updated = { ...prev, episodes: newEpisodes };
        projectDataRef.current = updated;
        return updated;
      });

      try {
        const chunksMap = new Map<string, Shot[]>();
        episode.shots.forEach((shot) => {
          const parts = shot.id.split("-");
          let sceneKey = "default";
          if (parts.length > 1) {
            const prefixParts = parts.slice(0, parts.length - 1);
            sceneKey = prefixParts.join("-");
          }
          if (!chunksMap.has(sceneKey)) chunksMap.set(sceneKey, []);
          chunksMap.get(sceneKey)?.push(shot);
        });
        const shotChunks: Shot[][] = Array.from(chunksMap.values());
        const { context, globalStyleGuide, storyboardGuide } = projectDataRef.current;

        let currentTotalUsage: TokenUsage =
          shouldResume && episode.storyboardGenUsage
            ? episode.storyboardGenUsage
            : { promptTokens: 0, responseTokens: 0, totalTokens: 0 };

        for (let i = 0; i < shotChunks.length; i += 1) {
          const chunk = shotChunks[i];
          const sceneId = chunk[0].id.split("-").slice(0, -1).join("-");
          const isChunkComplete = chunk.every(
            (s) => s.storyboardPrompt && s.storyboardPrompt.trim().length > 0
          );
          if (shouldResume && isChunkComplete && !forceRegenerate) {
            setStatus(`Skipping completed Scene ${sceneId} (${i + 1}/${shotChunks.length})...`);
            await new Promise((r) => setTimeout(r, 100));
            continue;
          }

          setStatus(`Episode ${episode.id}: Processing Scene ${sceneId} (${i + 1}/${shotChunks.length})...`);

          const result = await ResponsesTextService.generateStoryboardPrompts(
            config.textConfig,
            chunk,
            context,
            storyboardGuide,
            globalStyleGuide
          );

          currentTotalUsage = ResponsesTextService.addUsage(currentTotalUsage, result.usage);

          setProjectData((prev) => {
            const newEpisodes = [...prev.episodes];
            const currentEp = newEpisodes[index];
            const mergedShots = currentEp.shots.map((originalShot) => {
              const foundNew = result.partialShots.find((ns) => ns.id === originalShot.id);
              if (foundNew) {
                return { ...originalShot, storyboardPrompt: foundNew.storyboardPrompt };
              }
              return originalShot;
            });

            newEpisodes[index] = {
              ...currentEp,
              shots: mergedShots,
              storyboardGenUsage: currentTotalUsage,
            };
            const updated = { ...prev, episodes: newEpisodes };
            projectDataRef.current = updated;
            return updated;
          });
          await new Promise((r) => setTimeout(r, 500));
        }

        setProjectData((prev) => {
          const newEpisodes = [...prev.episodes];
          newEpisodes[index] = {
            ...newEpisodes[index],
            storyboardGenUsage: currentTotalUsage,
            status: "review_storyboard",
          };
          const updated = { ...prev, episodes: newEpisodes };
          projectDataRef.current = updated;
          return updated;
        });

        updateStats("storyboardGen", true);
        setActiveTab("table");
        setProcessing(false);
        setCurrentEpIndex(index);

        const remaining = findNextStoryboardIndex(projectDataRef.current.episodes || [], 0);
        if (remaining === -1) {
          setStep(WorkflowStep.COMPLETED);
          alert("All Storyboard Prompts Generated! You can proceed to image generation.");
          setCurrentEpIndex(0);
          return;
        }

        if (autoAdvance) {
          setCurrentEpIndex(remaining);
          return generateCurrentEpisodeStoryboard(remaining, true);
        }
      } catch (e: any) {
        console.error(e);
        setProjectData((prev) => {
          const newEpisodes = [...prev.episodes];
          newEpisodes[index] = {
            ...newEpisodes[index],
            status: "error",
            errorMsg: e.message || "Unknown error",
          };
          const updated = { ...prev, episodes: newEpisodes };
          projectDataRef.current = updated;
          return updated;
        });
        setStatus(`Error on Episode ${episode.id}`);
        setProcessing(false);
        updateStats("storyboardGen", false);
      }
    },
    [
      config,
      projectDataRef,
      setActiveTab,
      setCurrentEpIndex,
      setProcessing,
      setProjectData,
      setStatus,
      setStep,
      updateStats,
    ]
  );

  const startPhase4 = useCallback(() => {
    const data = projectDataRef.current;
    if (data.episodes.every((ep) => ep.shots.length === 0)) {
      alert("No shots found to generate storyboard prompts for. Please complete Phase 2 or Import a Shot List CSV.");
      return;
    }
    const pendingFromCurrent = findNextStoryboardIndex(projectDataRef.current.episodes || [], currentEpIndex);
    const startIndex =
      pendingFromCurrent !== -1 ? pendingFromCurrent : findNextStoryboardIndex(projectDataRef.current.episodes || [], 0);
    if (startIndex === -1) {
      alert("All Storyboard Prompts Generated! You can proceed to image generation.");
      setStep(WorkflowStep.COMPLETED);
      setCurrentEpIndex(0);
      return;
    }
    setStep(WorkflowStep.GENERATE_STORYBOARD);
    setCurrentEpIndex(startIndex);
    generateCurrentEpisodeStoryboard(startIndex, true);
  }, [currentEpIndex, generateCurrentEpisodeStoryboard, projectDataRef, setCurrentEpIndex, setStep]);

  const continueNextEpisodeStoryboard = useCallback(() => {
    if (isProcessing) return;
    const nextIndex = findNextStoryboardIndex(projectDataRef.current.episodes || [], currentEpIndex + 1);
    if (nextIndex === -1) {
      alert("All Storyboard Prompts Generated! You can proceed to image generation.");
      setStep(WorkflowStep.COMPLETED);
      setCurrentEpIndex(0);
      return;
    }
    setCurrentEpIndex(nextIndex);
    generateCurrentEpisodeStoryboard(nextIndex, true);
  }, [currentEpIndex, generateCurrentEpisodeStoryboard, isProcessing, projectDataRef, setCurrentEpIndex, setStep]);

  const retryCurrentEpisodeStoryboard = useCallback(() => {
    if (isProcessing) return;
    const idx = currentEpIndex;
    const targetEp = projectDataRef.current.episodes[idx];
    if (!targetEp) return;

    setProjectData((prev) => {
      const newEpisodes = [...prev.episodes];
      const ep = newEpisodes[idx];
      if (ep) {
        const clearedShots = ep.shots.map((s) => ({ ...s, storyboardPrompt: "" }));
        newEpisodes[idx] = {
          ...ep,
          shots: clearedShots,
          storyboardGenUsage: undefined,
          status: "pending" as any,
        };
      }
      const updated = { ...prev, episodes: newEpisodes };
      projectDataRef.current = updated;
      return updated;
    });
    generateCurrentEpisodeStoryboard(idx, false, true);
  }, [currentEpIndex, generateCurrentEpisodeStoryboard, isProcessing, projectDataRef, setProjectData]);

  return {
    startPhase4,
    continueNextEpisodeStoryboard,
    retryCurrentEpisodeStoryboard,
  };
};
