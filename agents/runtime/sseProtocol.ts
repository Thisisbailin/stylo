const readDataPacket = (frame: string) => {
  const dataLines = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""));
  return dataLines.length ? dataLines.join("\n") : null;
};

export const drainAgentSseBuffer = (buffer: string, flush = false) => {
  const packets: string[] = [];
  let remainder = buffer;
  while (true) {
    const separator = remainder.match(/\r?\n\r?\n/);
    if (!separator || separator.index === undefined) break;
    const frame = remainder.slice(0, separator.index);
    remainder = remainder.slice(separator.index + separator[0].length);
    const packet = readDataPacket(frame);
    if (packet !== null) packets.push(packet);
  }
  if (flush && remainder.trim()) {
    const packet = readDataPacket(remainder.trim());
    if (packet !== null) packets.push(packet);
    remainder = "";
  }
  return { packets, remainder };
};
