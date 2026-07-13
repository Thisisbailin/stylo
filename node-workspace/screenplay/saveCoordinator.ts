export type ScreenplayDraftSnapshot = {
  title: string;
  body: string;
};

export type PendingScreenplaySave = {
  submitted: ScreenplayDraftSnapshot;
  previousSource: ScreenplayDraftSnapshot;
};

export type IncomingSourceDecision = "acknowledge" | "stale" | "adopt" | "conflict" | "unchanged";

export const screenplayDraftsEqual = (left: ScreenplayDraftSnapshot, right: ScreenplayDraftSnapshot) =>
  left.title === right.title && left.body === right.body;

export const prepareScreenplayDraftForSave = (draft: ScreenplayDraftSnapshot): ScreenplayDraftSnapshot => ({
  title: draft.title.trim() || "剧本文档",
  // Lines edited by the block editor are already canonical Fountain. Re-running
  // structural inference here can silently change untouched lines during autosave.
  body: draft.body.replace(/\r\n?/g, "\n"),
});

export const classifyIncomingScreenplaySource = (input: {
  source: ScreenplayDraftSnapshot;
  draft: ScreenplayDraftSnapshot;
  lastCommitted: ScreenplayDraftSnapshot;
  lastObservedSource: ScreenplayDraftSnapshot;
  pendingSave: PendingScreenplaySave | null;
}): IncomingSourceDecision => {
  const { source, draft, lastCommitted, lastObservedSource, pendingSave } = input;
  if (screenplayDraftsEqual(source, lastObservedSource)) return "unchanged";
  if (pendingSave && screenplayDraftsEqual(source, pendingSave.submitted)) return "acknowledge";
  if (pendingSave && screenplayDraftsEqual(source, pendingSave.previousSource)) return "stale";
  if (screenplayDraftsEqual(source, lastCommitted)) return "acknowledge";
  if (screenplayDraftsEqual(draft, lastCommitted)) return "adopt";
  return "conflict";
};
