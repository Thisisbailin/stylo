import type { ProjectRoleIdentity } from "../../types";

export type NodeFlowRoleUpdater = (
  roleId: string,
  updater: (role: ProjectRoleIdentity) => ProjectRoleIdentity
) => void;

export type NodeFlowCollaborationState = {
  appConfig: any;
  projectRoleUpdater: NodeFlowRoleUpdater | null;
};

export const createEmptyNodeFlowCollaborationState = (): NodeFlowCollaborationState => ({
  appConfig: null,
  projectRoleUpdater: null,
});

export const setNodeFlowAppConfigState = <T extends NodeFlowCollaborationState>(
  state: T,
  appConfig: any
): T => ({
  ...state,
  appConfig,
});

export const setNodeFlowProjectRoleUpdaterState = <T extends NodeFlowCollaborationState>(
  state: T,
  projectRoleUpdater: NodeFlowRoleUpdater | null
): T => ({
  ...state,
  projectRoleUpdater,
});

export const mutateNodeFlowProjectRole = (
  state: NodeFlowCollaborationState,
  roleId: string,
  updater: (role: ProjectRoleIdentity) => ProjectRoleIdentity
) => {
  state.projectRoleUpdater?.(roleId, updater);
};
