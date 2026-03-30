export const getNodeHandles = (nodeType: string): { inputs: string[]; outputs: string[] } => {
  switch (nodeType) {
    case "imageInput":
      return { inputs: [], outputs: ["image"] };
    case "audioInput":
      return { inputs: [], outputs: ["audio"] };
    case "annotation":
      return { inputs: ["image"], outputs: ["image"] };
    case "prompt":
      return { inputs: [], outputs: ["text"] };
    case "text":
      return { inputs: ["text"], outputs: ["text"] };
    case "scriptBoard":
      return { inputs: [], outputs: ["text"] };
    case "storyboardBoard":
      return { inputs: [], outputs: ["text"] };
    case "identityCard":
      return { inputs: [], outputs: ["text"] };
    case "imageGen":
    case "nanoBananaImageGen":
      return { inputs: ["image", "text"], outputs: ["image"] };
    case "wanImageGen":
      return { inputs: ["image", "text"], outputs: ["image"] };
    case "soraVideoGen":
      return { inputs: ["image", "text"], outputs: [] };
    case "wanVideoGen":
    case "wanReferenceVideoGen":
      return { inputs: ["image", "text"], outputs: [] };
    case "seedanceVideoGen":
      return { inputs: ["image", "text", "audio"], outputs: [] };
    default:
      return { inputs: [], outputs: [] };
  }
};

export const isValidConnection = (connection: { sourceHandle?: string | null; targetHandle?: string | null }) => {
  const { sourceHandle, targetHandle } = connection;
  if (sourceHandle === "image" && targetHandle !== "image") return false;
  if (sourceHandle === "text" && targetHandle !== "text") return false;
  if (sourceHandle === "audio" && targetHandle !== "audio") return false;
  return true;
};
